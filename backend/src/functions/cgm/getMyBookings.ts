import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import { QueryCommand } from '@aws-sdk/lib-dynamodb'
import { requireRole } from '../../utils/auth'
import { dynamoDB, TABLE_NAMES } from '../../utils/dynamodb'
import { Responses, successResponse } from '../../utils/response'

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const caller = requireRole(event, ['CGM'])
  if (!caller) return Responses.unauthorized()

  try {
    const result = await dynamoDB.send(new QueryCommand({
      TableName: TABLE_NAMES.BOOKINGS,
      IndexName: 'cgm-bookings-index',
      KeyConditionExpression: 'cgmId = :cgmId',
      ExpressionAttributeValues: { ':cgmId': caller.userId },
      ScanIndexForward: false,
    }))

    const bookings = (result.Items || []).map(booking => ({
      ...booking,
      cgmMobile: undefined,
    }))
    return successResponse(bookings)
  } catch (error) {
    console.error('getMyBookings failed', error)
    return Responses.serverError()
  }
}