import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import { GetCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb'
import { requireRole } from '../../utils/auth'
import { dynamoDB, TABLE_NAMES } from '../../utils/dynamodb'
import { errorResponse, successResponse, Responses } from '../../utils/response'
import { createNotification } from '../../utils/notifications'
import type { BookingStatus } from '../../models'

const DRIVER_ALLOWED_STATUSES: BookingStatus[] = [
  'ACCEPTED',
  'ON_THE_WAY',
  'ARRIVED',
  'ON_SITE',
  'COMPLETED',
]

const validTransitions: Record<string, BookingStatus[]> = {
  BOOKED:       ['ACCEPTED'],
  BOOKING_PENDING: ['ACCEPTED'],
  CONFIRMED:    ['ACCEPTED'],
  ACCEPTED:     ['ON_THE_WAY'],
  ON_THE_WAY:   ['ON_SITE', 'ARRIVED'],
  ARRIVED:      ['ON_SITE'],
  ON_SITE:      ['COMPLETED'],
  COMPLETED:    [],
  CANCELLED:    [],
}

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const caller = requireRole(event, ['DRIVER'])
  if (!caller) return Responses.unauthorized()

  const bookingId = event.pathParameters?.bookingId
  if (!bookingId) return errorResponse('bookingId is required')

  let body: { status?: string }
  try {
    body = JSON.parse(event.body || '{}')
  } catch {
    return errorResponse('Invalid request body')
  }

  const rawStatus = body.status
  // Normalize ARRIVED -> ON_SITE internally
  const normalizedStatus = rawStatus === 'ARRIVED' ? 'ON_SITE' : rawStatus

  if (!normalizedStatus || !DRIVER_ALLOWED_STATUSES.includes(normalizedStatus as BookingStatus)) {
    return errorResponse(`Status must be one of: ${DRIVER_ALLOWED_STATUSES.join(', ')}`)
  }

  try {
    const bookingResponse = await dynamoDB.send(
      new GetCommand({
        TableName: TABLE_NAMES.BOOKINGS,
        Key: { PK: `BOOKING#${bookingId}`, SK: 'DETAILS' },
      })
    )

    const booking = bookingResponse.Item
    if (!booking) return errorResponse('Booking not found', 404)

    if (booking.driverId !== caller.userId) {
      return Responses.unauthorized()
    }

    // Support both 'bookingStatus' and legacy 'status' field names
    const currentStatus = (booking.bookingStatus || booking.status || 'BOOKED') as string
    const nextStatus = normalizedStatus as BookingStatus

    const allowedNext = validTransitions[currentStatus]
    if (!allowedNext || !allowedNext.includes(nextStatus)) {
      return errorResponse(`Invalid trip transition from ${currentStatus} to ${nextStatus}.`, 409)
    }

    const now = new Date().toISOString()

    // Determine new cab status based on booking transition
    // IMPORTANT: Only restore AVAILABLE on COMPLETED; keep driver assigned otherwise
    const nextCabStatus =
      nextStatus === 'COMPLETED' ? 'AVAILABLE' :
      nextStatus === 'ACCEPTED'  ? 'ASSIGNED' :
      'ON_TRIP'

    // Build cab update expression: only REMOVE assignedDriver when COMPLETED
    const cabUpdateExpr = nextStatus === 'COMPLETED'
      ? 'SET #status = :status, updatedAt = :updatedAt REMOVE assignedDriverId, assignedDriverName'
      : 'SET #status = :status, updatedAt = :updatedAt'

    // Atomically update both booking and cab in a single transaction
    await dynamoDB.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Update: {
              TableName: TABLE_NAMES.BOOKINGS,
              Key: { PK: `BOOKING#${bookingId}`, SK: 'DETAILS' },
              UpdateExpression: 'SET bookingStatus = :status, #legacyStatus = :status, updatedAt = :updatedAt',
              ExpressionAttributeNames: { '#legacyStatus': 'status' },
              ExpressionAttributeValues: {
                ':status': nextStatus,
                ':updatedAt': now,
              },
            },
          },
          {
            Update: {
              TableName: TABLE_NAMES.CABS,
              Key: { PK: `CAB#${booking.cabId}`, SK: 'DETAILS' },
              UpdateExpression: cabUpdateExpr,
              ExpressionAttributeNames: { '#status': 'status' },
              ExpressionAttributeValues: {
                ':status': nextCabStatus,
                ':updatedAt': now,
              },
            },
          },
        ],
      })
    )

    // Send notification to CGM (non-blocking — never fails the booking update)
    try {
      const notifType =
        nextStatus === 'ACCEPTED'    ? 'DRIVER_ACCEPTED' :
        nextStatus === 'ON_THE_WAY'  ? 'DRIVER_ON_THE_WAY' :
        nextStatus === 'ON_SITE'     ? 'DRIVER_ARRIVED' :
        nextStatus === 'COMPLETED'   ? 'TRIP_COMPLETED' : null

      if (notifType && booking.cgmId) {
        await createNotification(booking.cgmId, notifType, {
          bookingId,
          driverName: caller.name,
          cabNumber: booking.cabNumber,
          bookingDate: booking.bookingDate,
          startTime: booking.startTime,
          endTime: booking.endTime,
          updatedAt: now,
        })
      }
    } catch (err) {
      console.warn('Notification failed (non-critical)', err)
    }

    return successResponse({ bookingId, status: nextStatus, cabStatus: nextCabStatus })
  } catch (error: any) {
    if (error?.name === 'TransactionCanceledException') {
      return errorResponse('Could not update trip status — concurrent update conflict. Please try again.', 409)
    }
    console.error('updateTripStatus failed', error)
    return Responses.serverError()
  }
}
