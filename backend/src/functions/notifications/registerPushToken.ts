import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import { UpdateCommand } from '@aws-sdk/lib-dynamodb'
import { requireRole } from '../../utils/auth'
import { dynamoDB, TABLE_NAMES } from '../../utils/dynamodb'
import { errorResponse, Responses, successResponse } from '../../utils/response'

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const caller = requireRole(event, ['ADMIN', 'CGM', 'DRIVER'])
  if (!caller) return Responses.unauthorized()

  let body: { token?: string }
  try { body = JSON.parse(event.body || '{}') } catch { return errorResponse('Invalid request body') }
  const token = body.token?.trim()
  if (!token || token.length < 20) return errorResponse('A valid FCM token is required')

  try {
    await dynamoDB.send(new UpdateCommand({
      TableName: TABLE_NAMES.USERS,
      Key: { PK: `USER#${caller.userId}`, SK: 'PROFILE' },
      UpdateExpression: 'ADD pushTokens :token SET updatedAt = :updatedAt',
      ExpressionAttributeValues: {
        ':token': new Set([token]),
        ':updatedAt': new Date().toISOString(),
      },
    }))
    return successResponse({ registered: true })
  } catch (error) {
    console.error('registerPushToken failed', error)
    return Responses.serverError()
  }
}
