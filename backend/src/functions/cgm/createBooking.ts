import { randomUUID } from 'crypto'
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import { GetCommand, QueryCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb'
import { requireRole } from '../../utils/auth'
import { dynamoDB, TABLE_NAMES } from '../../utils/dynamodb'
import { errorResponse, successResponse, Responses } from '../../utils/response'

/**
 * POST /cgm/bookings
 *
 * Creates a new cab booking for the authenticated CGM.
 * Uses a DynamoDB transaction to prevent double booking.
 * Only accessible by CGM role.
 */
export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const caller = requireRole(event, ['CGM'])
  if (!caller) return Responses.unauthorized()

  let body: { cabId?: string; bookingDate?: string; timeSlot?: string; siteLocation?: string }
  try {
    body = JSON.parse(event.body || '{}')
  } catch {
    return errorResponse('Invalid request body')
  }

  const { cabId, bookingDate, timeSlot, siteLocation } = body
  if (!cabId || !bookingDate || !timeSlot || !siteLocation) {
    return errorResponse('cabId, bookingDate, timeSlot, and siteLocation are all required')
  }

  try {
    const cabKey = `CAB#${cabId}`
    const cabResponse = await dynamoDB.send(
      new GetCommand({
        TableName: TABLE_NAMES.CABS,
        Key: { PK: cabKey, SK: 'DETAILS' },
      })
    )

    const cab = cabResponse.Item
    if (!cab) {
      return errorResponse('Cab not found', 404)
    }

    if (cab.status !== 'AVAILABLE') {
      return errorResponse('Cab is not currently available for booking', 409)
    }

    const bookingDateSlot = `${bookingDate}#${timeSlot}`
    const existingBookingResult = await dynamoDB.send(
      new QueryCommand({
        TableName: TABLE_NAMES.BOOKINGS,
        IndexName: 'cab-slot-index',
        KeyConditionExpression: 'cabId = :cabId AND bookingDateSlot = :bookingDateSlot',
        ExpressionAttributeValues: {
          ':cabId': cabId,
          ':bookingDateSlot': bookingDateSlot,
        },
      })
    )

    if ((existingBookingResult.Items || []).length > 0) {
      return errorResponse('This cab is already booked for the selected date and time slot', 409)
    }

    const bookingId = randomUUID()
    const now = new Date().toISOString()
    const lockPk = `LOCK#${cabId}#${bookingDate}#${timeSlot}`

    await dynamoDB.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            ConditionCheck: {
              TableName: TABLE_NAMES.CABS,
              Key: { PK: cabKey, SK: 'DETAILS' },
              ConditionExpression: '#status = :available',
              ExpressionAttributeNames: {
                '#status': 'status',
              },
              ExpressionAttributeValues: {
                ':available': 'AVAILABLE',
              },
            },
          },
          {
            Put: {
              TableName: TABLE_NAMES.BOOKINGS,
              Item: {
                PK: `BOOKING#${bookingId}`,
                SK: 'DETAILS',
                bookingId,
                cgmId: caller.userId,
                cgmName: caller.name,
                cgmMobile: caller.mobile || '',
                cabId,
                cabNumber: cab.cabNumber,
                driverId: 'UNASSIGNED',
                driverName: 'Pending Assignment',
                driverMobile: '',
                siteLocation,
                bookingDate,
                bookingDateSlot,
                timeSlot,
                bookingStatus: 'BOOKED',
                createdAt: now,
                updatedAt: now,
              },
              ConditionExpression: 'attribute_not_exists(PK)',
            },
          },
          {
            Put: {
              TableName: TABLE_NAMES.SLOTS,
              Item: {
                PK: lockPk,
                SK: 'LOCK',
                bookingId,
                createdAt: now,
              },
              ConditionExpression: 'attribute_not_exists(PK)',
            },
          },
        ],
      })
    )

    return successResponse({
      bookingId,
      cabId,
      bookingDate,
      timeSlot,
      siteLocation,
      bookingStatus: 'BOOKED',
      createdAt: now,
    })
  } catch (error: any) {
    if (error?.name === 'TransactionCanceledException') {
      return errorResponse('This cab is already booked for the selected date and time slot', 409)
    }
    if (error?.name === 'ConditionalCheckFailedException') {
      return errorResponse('This cab is already booked for the selected date and time slot', 409)
    }
    console.error('createBooking failed', error)
    return Responses.serverError()
  }
}
