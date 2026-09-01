import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import { UpdateCommand } from '@aws-sdk/lib-dynamodb'
import { requireRole } from '../../utils/auth'
import { dynamoDB, TABLE_NAMES } from '../../utils/dynamodb'
import { errorResponse, successResponse, Responses } from '../../utils/response'

/**
 * PATCH /v1/notifications/{notificationId}/read
 * Marks a single notification as read for the authenticated user.
 */
export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const caller = requireRole(event, ['CGM', 'DRIVER', 'ADMIN'])
  if (!caller) return Responses.unauthorized()

  const notificationId = event.pathParameters?.notificationId
  if (!notificationId) return errorResponse('notificationId is required')

  try {
    const now = new Date().toISOString()
    // Build composite SK: NOTIF#<notificationId>
    // notificationId already starts with the timestamp, but the full SK is NOTIF#<notificationId>
    const sk = notificationId.startsWith('NOTIF#') ? notificationId : `NOTIF#${notificationId}`

    await dynamoDB.send(new UpdateCommand({
      TableName: TABLE_NAMES.NOTIFICATIONS,
      Key: {
        PK: `NOTIF#${caller.userId}`,
        SK: sk,
      },
      UpdateExpression: 'SET readAt = :now',
      ConditionExpression: 'attribute_exists(PK)',
      ExpressionAttributeValues: { ':now': now },
    }))

    return successResponse({ notificationId, readAt: now })
  } catch (error: any) {
    if (error?.name === 'ConditionalCheckFailedException') {
      return errorResponse('Notification not found', 404)
    }
    console.error('markRead failed', error)
    return Responses.serverError()
  }
}
