import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import { QueryCommand } from '@aws-sdk/lib-dynamodb'
import { requireRole } from '../../utils/auth'
import { dynamoDB, TABLE_NAMES } from '../../utils/dynamodb'
import { Responses, successResponse } from '../../utils/response'

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const caller = requireRole(event, ['CGM'])
  if (!caller) return Responses.unauthorized()

  try {
    const records: Record<string, any>[] = []
    let lastEvaluatedKey: Record<string, unknown> | undefined
    do {
      const result = await dynamoDB.send(new QueryCommand({
        TableName: TABLE_NAMES.BOOKINGS,
        IndexName: 'cgm-bookings-index',
        KeyConditionExpression: 'cgmId = :cgmId',
        ExpressionAttributeValues: { ':cgmId': caller.userId },
        ScanIndexForward: false,
        ExclusiveStartKey: lastEvaluatedKey,
      }))
      records.push(...((result.Items || []) as Record<string, any>[]))
      lastEvaluatedKey = result.LastEvaluatedKey
    } while (lastEvaluatedKey)

    const ACTIVE_STATUSES = ['BOOKING_PENDING', 'CONFIRMED', 'ACCEPTED', 'ON_THE_WAY', 'ON_SITE', 'ARRIVED']

    const bookings = records.map(booking => {
      const status = booking.bookingStatus || booking.status || ''
      const isActive = ACTIVE_STATUSES.includes(status)
      return {
        ...booking,
        // Only expose driver mobile for active bookings — not historical ones
        driverMobile: isActive ? booking.driverMobile : undefined,
        cgmMobile: undefined,
      }
    })
    console.info('getMyBookings', { userId: caller.userId, role: caller.role, count: bookings.length })
    return successResponse(bookings)
  } catch (error) {
    console.error('getMyBookings failed', { userId: caller.userId, error })
    return Responses.serverError()
  }
}