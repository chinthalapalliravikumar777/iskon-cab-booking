import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import { ScanCommand } from '@aws-sdk/lib-dynamodb'
import { requireRole } from '../../utils/auth'
import { dynamoDB, TABLE_NAMES } from '../../utils/dynamodb'
import { Responses, successResponse } from '../../utils/response'

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const caller = requireRole(event, ['DRIVER'])
  if (!caller) return Responses.unauthorized()

  try {
    const result = await dynamoDB.send(new ScanCommand({
      TableName: TABLE_NAMES.CABS,
      FilterExpression: 'assignedDriverId = :driverId',
      ExpressionAttributeValues: { ':driverId': caller.userId },
    }))
    return successResponse((result.Items || [])[0] || null)
  } catch (error) {
    console.error('getMyCab failed', error)
    return Responses.serverError()
  }
}
