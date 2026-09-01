$poolId = 'ap-south-1_cPcHqv75W'
$clientId = '7glgjmfmm0veffbb4i5bpd7at4'
$profile = 'iskondev'
$apiBase = 'https://48dq6jpr23.execute-api.ap-south-1.amazonaws.com'
$password = 'DemoPass1!'
$aws = 'C:\Users\rk\AppData\Local\Programs\Amazon\AWSCLIV2\aws.exe'

$usersJson = & $aws cognito-idp list-users --user-pool-id $poolId --profile $profile --query 'Users[].Username' --output json 2>$null | ConvertFrom-Json
if ($null -eq $usersJson) { $usersJson = @() }
$existingUsers = [System.Collections.Generic.HashSet[string]]::new([string[]]$usersJson)

for ($i = 1; $i -le 20; $i++) {
  $email = "cgm$($i.ToString('00'))@example.com"
  if (-not $existingUsers.Contains($email)) {
    $name = "CGM $i"
    & $aws cognito-idp admin-create-user --user-pool-id $poolId --username $email --user-attributes Name=email,Value=$email Name=email_verified,Value=true Name=name,Value=$name Name=custom:role,Value=CGM --temporary-password $password --message-action SUPPRESS --profile $profile 2>$null | Out-Null
    & $aws cognito-idp admin-set-user-password --user-pool-id $poolId --username $email --password $password --permanent --profile $profile 2>$null | Out-Null
    $existingUsers.Add($email) | Out-Null
  }
}

for ($i = 1; $i -le 10; $i++) {
  $email = "driver$($i.ToString('00'))@example.com"
  if (-not $existingUsers.Contains($email)) {
    $name = "Driver $i"
    & $aws cognito-idp admin-create-user --user-pool-id $poolId --username $email --user-attributes Name=email,Value=$email Name=email_verified,Value=true Name=name,Value=$name Name=custom:role,Value=DRIVER Name=custom:mobile,Value="+91-90000-$($i.ToString('0000'))" --temporary-password $password --message-action SUPPRESS --profile $profile 2>$null | Out-Null
    & $aws cognito-idp admin-set-user-password --user-pool-id $poolId --username $email --password $password --permanent --profile $profile 2>$null | Out-Null
    $existingUsers.Add($email) | Out-Null
  }
}

$existingCabNamesJson = & $aws dynamodb scan --table-name iskon-cabs --profile $profile --query 'Items[].cabNumber.S' --output json 2>$null | ConvertFrom-Json
if ($null -eq $existingCabNamesJson) { $existingCabNamesJson = @() }
$existingCabNames = [System.Collections.Generic.HashSet[string]]::new([string[]]$existingCabNamesJson)

for ($i = 1; $i -le 10; $i++) {
  $cabNumber = "Toyota Cab $i"
  if (-not $existingCabNames.Contains($cabNumber)) {
    $cabId = [guid]::NewGuid().ToString()
    $driverEmail = "driver$($i.ToString('00'))@example.com"
    $driverName = "Driver $i"
    $ts = (Get-Date).ToString('o')
    $reg = "TC-$($i.ToString('000'))"
    $item = [ordered]@{
      PK = @{ S = "CAB#$cabId" }
      SK = @{ S = 'DETAILS' }
      cabId = @{ S = $cabId }
      cabNumber = @{ S = $cabNumber }
      vehicleModel = @{ S = 'Toyota Innova' }
      registrationNumber = @{ S = $reg }
      vehicleDetails = @{ S = "Demo cab $i" }
      status = @{ S = 'AVAILABLE' }
      assignedDriverId = @{ S = $driverEmail }
      assignedDriverName = @{ S = $driverName }
      updatedAt = @{ S = $ts }
    }
    $json = $item | ConvertTo-Json -Compress -Depth 10
    $file = Join-Path $env:TEMP "cab-$i.json"
    [System.IO.File]::WriteAllText($file, $json)
    & $aws dynamodb put-item --table-name iskon-cabs --item "file://$file" --profile $profile 2>$null | Out-Null
    $existingCabNames.Add($cabNumber) | Out-Null
  }
}

Write-Host 'Ensured 20 CGMs, 10 drivers, and 10 cabs.'
$auth = & $aws cognito-idp initiate-auth --client-id $clientId --auth-flow USER_PASSWORD_AUTH --auth-parameters USERNAME=cgm01@example.com,PASSWORD=$password --profile $profile | ConvertFrom-Json
$idToken = $auth.AuthenticationResult.IdToken
$headers = @{ Authorization = "Bearer $idToken" }
$available = Invoke-RestMethod -Uri "$apiBase/v1/cgm/cabs/available?date=2026-08-26&slot=06:00-08:30" -Headers $headers -Method Get
Write-Host "Available cabs returned: $($available.data.Count)"
$firstCab = $available.data[0]
if ($null -ne $firstCab) {
  $payload = @{ cabId = $firstCab.cabId; bookingDate = '2026-08-26'; startTime = '06:00'; endTime = '08:30'; siteLocation = 'Demo Site' } | ConvertTo-Json -Depth 10
  $resp = Invoke-RestMethod -Uri "$apiBase/v1/cgm/bookings" -Headers $headers -Method Post -ContentType 'application/json' -Body $payload
  Write-Host ($resp | ConvertTo-Json -Depth 10)
} else {
  Write-Host 'No available cabs returned from the API.'
}
