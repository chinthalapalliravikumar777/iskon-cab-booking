import {
  AdminCreateUserCommand,
  AdminSetUserPasswordCommand,
  AdminEnableUserCommand,
  AdminDisableUserCommand,
  CognitoIdentityProviderClient,
  ListUsersCommand,
} from '@aws-sdk/client-cognito-identity-provider'
import type { APIGatewayProxyEvent } from 'aws-lambda'
import { requireRole } from '../../utils/auth'
import { errorResponse, successResponse } from '../../utils/response'

const cognitoClient = new CognitoIdentityProviderClient({})

export async function handler(event: APIGatewayProxyEvent) {
  const method = (event as any).requestContext?.http?.method || event.httpMethod
  if (method === 'GET') return listUsers(event)

  const caller = requireRole(event, ['ADMIN'])
  if (!caller) return errorResponse('Only administrators can create users.', 403)

  let body: { email?: string; name?: string; mobile?: string; password?: string; role?: 'CGM' | 'DRIVER' }
  try {
    body = JSON.parse(event.body || '{}')
  } catch {
    return errorResponse('Request body must be valid JSON.')
  }

  const email = body.email?.trim().toLowerCase()
  const name = body.name?.trim()
  const mobile = body.mobile?.trim()
  const password = body.password
  const role = body.role

  if (!email || !name || !password || !role) {
    return errorResponse('Email, name, password, and role are required.')
  }
  if (!email.includes('@')) return errorResponse('Please provide a valid email address.')
  if (role !== 'CGM' && role !== 'DRIVER') return errorResponse('Role must be CGM or DRIVER.')
  if (password.length < 8 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
    return errorResponse('Password must be at least 8 characters and include uppercase, lowercase, and a number.')
  }

  try {
    const result = await cognitoClient.send(new AdminCreateUserCommand({
      UserPoolId: process.env.USER_POOL_ID,
      Username: email,
      MessageAction: 'SUPPRESS',
      TemporaryPassword: password,
      UserAttributes: [
        { Name: 'email', Value: email },
        { Name: 'email_verified', Value: 'true' },
        { Name: 'name', Value: name },
        { Name: 'custom:role', Value: role },
        ...(mobile ? [{ Name: 'custom:mobile', Value: mobile }] : []),
      ],
    }))

    await cognitoClient.send(new AdminSetUserPasswordCommand({
      UserPoolId: process.env.USER_POOL_ID,
      Username: email,
      Password: password,
      Permanent: true,
    }))

    return successResponse({
      userId: result.User?.Username,
      email,
      name,
      mobile: mobile || '',
      role,
      message: 'User created with the exact password provided by the administrator.',
    }, 201)
  } catch (error: any) {
    if (error?.name === 'UsernameExistsException') {
      return errorResponse('A user with this email already exists.', 409)
    }
    console.error('Failed to create Cognito user', error)
    return errorResponse('Could not create the user.', 500)
  }
}

export async function resetPassword(event: APIGatewayProxyEvent) {
  const caller = requireRole(event, ['ADMIN'])
  if (!caller) return errorResponse('Only administrators can change user passwords.', 403)

  let body: { password?: string }
  try {
    body = JSON.parse(event.body || '{}')
  } catch {
    return errorResponse('Request body must be valid JSON.')
  }

  const username = event.pathParameters?.username
  const password = body.password
  if (!username || !password) return errorResponse('User login ID and password are required.')
  if (password.length < 8 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
    return errorResponse('Password must be at least 8 characters and include uppercase, lowercase, and a number.')
  }

  try {
    await cognitoClient.send(new AdminSetUserPasswordCommand({
      UserPoolId: process.env.USER_POOL_ID,
      Username: decodeURIComponent(username),
      Password: password,
      Permanent: true,
    }))
    return successResponse({ message: 'Password changed successfully by the administrator.' })
  } catch (error: any) {
    if (error?.name === 'UserNotFoundException') return errorResponse('No user exists with this login ID.', 404)
    console.error('Failed to reset Cognito user password', error)
    return errorResponse('Could not change the user password.', 500)
  }
}

export async function listUsers(event: APIGatewayProxyEvent) {
  const caller = requireRole(event, ['ADMIN'])
  if (!caller) return errorResponse('Only administrators can view user accounts.', 403)

  try {
    const result = await cognitoClient.send(new ListUsersCommand({
      UserPoolId: process.env.USER_POOL_ID,
      Limit: 60,
    }))

    const users = (result.Users || []).map(user => {
      const attributes = Object.fromEntries((user.Attributes || []).map(attribute => [attribute.Name, attribute.Value || '']))
      return {
        userId: user.Username,
        email: attributes.email || user.Username,
        name: attributes.name || '',
        mobile: attributes['custom:mobile'] || '',
        role: attributes['custom:role'] || '',
        status: user.UserStatus,
        enabled: user.Enabled,
      }
    }).filter(user => user.role === 'CGM' || user.role === 'DRIVER')

    return successResponse(users)
  } catch (error) {
    console.error('Failed to list Cognito users', error)
    return errorResponse('Could not load user accounts.', 500)
  }
}

/**
 * PATCH /v1/admin/users/{username}/status
 * Enable or disable a Cognito user account.
 */
export async function toggleUserStatus(event: APIGatewayProxyEvent) {
  const caller = requireRole(event, ['ADMIN'])
  if (!caller) return errorResponse('Only administrators can change user status.', 403)

  const username = event.pathParameters?.username
  if (!username) return errorResponse('Username is required.')

  let body: { enabled?: boolean }
  try {
    body = JSON.parse(event.body || '{}')
  } catch {
    return errorResponse('Request body must be valid JSON.')
  }

  if (body.enabled === undefined) return errorResponse('enabled (true/false) is required.')

  try {
    const decodedUsername = decodeURIComponent(username)
    if (body.enabled) {
      await cognitoClient.send(new AdminEnableUserCommand({
        UserPoolId: process.env.USER_POOL_ID,
        Username: decodedUsername,
      }))
    } else {
      await cognitoClient.send(new AdminDisableUserCommand({
        UserPoolId: process.env.USER_POOL_ID,
        Username: decodedUsername,
      }))
    }
    return successResponse({ username: decodedUsername, enabled: body.enabled })
  } catch (error: any) {
    if (error?.name === 'UserNotFoundException') return errorResponse('No user exists with this login ID.', 404)
    console.error('Failed to toggle user status', error)
    return errorResponse('Could not update user status.', 500)
  }
}
