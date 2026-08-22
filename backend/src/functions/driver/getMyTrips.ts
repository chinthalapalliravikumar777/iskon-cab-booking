import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import { QueryCommand } from '@aws-sdk/lib-dynamodb'
import { requireRole } from '../../utils/auth'
import { dynamoDB, TABLE_NAMES } from '../../utils/dynamodb'
import { Responses, successResponse } from '../../utils/response'

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const caller = requireRole(event, ['DRIVER'])
  if (!caller) return Responses.unauthorized()

  try {
    const result = await dynamoDB.send(new QueryCommand({
      TableName: TABLE_NAMES.BOOKINGS,
      IndexName: 'driver-bookings-index',
      KeyConditionExpression: 'driverId = :driverId',
      ExpressionAttributeValues: { ':driverId': caller.userId },
      ScanIndexForward: true,
    }))

    return successResponse((result.Items || []).map(booking => ({
      ...booking,
      driverMobile: undefined,
    })))
  } catch (error) {
    console.error('getMyTrips failed', error)
    return Responses.serverError()
  }
}