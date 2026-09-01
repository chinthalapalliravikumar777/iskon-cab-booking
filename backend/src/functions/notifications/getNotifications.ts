import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import { QueryCommand } from '@aws-sdk/lib-dynamodb'
import { requireRole } from '../../utils/auth'
import { dynamoDB, TABLE_NAMES } from '../../utils/dynamodb'
import { successResponse, errorResponse, Responses } from '../../utils/response'

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const caller = requireRole(event, ['CGM', 'DRIVER', 'ADMIN'])
  if (!caller) return Responses.unauthorized()

  try {
    const pk = `NOTIF#${caller.userId}`
    const result = await dynamoDB.send(new QueryCommand({
      TableName: TABLE_NAMES.NOTIFICATIONS,
      KeyConditionExpression: 'PK = :pk',
      ExpressionAttributeValues: { ':pk': pk },
      ScanIndexForward: false,
      Limit: 100,
    }))

    const items = result.Items || []
    return successResponse(items)
  } catch (err) {
    console.error('getNotifications failed', err)
    return Responses.serverError()
  }
}

export default handler
