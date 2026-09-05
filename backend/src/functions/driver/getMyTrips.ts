import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import { QueryCommand } from '@aws-sdk/lib-dynamodb'
import { requireRole } from '../../utils/auth'
import { dynamoDB, TABLE_NAMES } from '../../utils/dynamodb'
import { Responses, successResponse } from '../../utils/response'

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const caller = requireRole(event, ['DRIVER'])
  if (!caller) return Responses.unauthorized()

  try {
    const trips: Record<string, any>[] = []
    let lastEvaluatedKey: Record<string, unknown> | undefined
    do {
      const result = await dynamoDB.send(new QueryCommand({
        TableName: TABLE_NAMES.BOOKINGS,
        IndexName: 'driver-bookings-index',
        KeyConditionExpression: 'driverId = :driverId',
        ExpressionAttributeValues: { ':driverId': caller.userId },
        ScanIndexForward: true,
        ExclusiveStartKey: lastEvaluatedKey,
      }))
      trips.push(...((result.Items || []) as Record<string, any>[]))
      lastEvaluatedKey = result.LastEvaluatedKey
    } while (lastEvaluatedKey)

    console.info('getMyTrips', { userId: caller.userId, role: caller.role, count: trips.length })
    return successResponse(trips.map(booking => ({
      ...booking,
      driverMobile: undefined,
    })))
  } catch (error) {
    console.error('getMyTrips failed', { userId: caller.userId, error })
    return Responses.serverError()
  }
}