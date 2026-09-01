import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import { GetCommand, UpdateCommand, TransactWriteCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb'
import { requireRole } from '../../utils/auth'
import { dynamoDB, TABLE_NAMES } from '../../utils/dynamodb'
import { errorResponse, successResponse, Responses } from '../../utils/response'
import { intervalLockTimes } from '../../utils/bookingTime'

type Decision = 'ACCEPT' | 'REJECT'

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const caller = requireRole(event, ['DRIVER'])
  if (!caller) return Responses.unauthorized()

  const bookingId = event.pathParameters?.bookingId
  if (!bookingId) return errorResponse('bookingId is required')

  let body: { action?: Decision }
  try { body = JSON.parse(event.body || '{}') } catch { return errorResponse('Invalid request body') }
  const action = body.action
  if (action !== 'ACCEPT' && action !== 'REJECT') return errorResponse('Action must be ACCEPT or REJECT')

  try {
    const bookingResp = await dynamoDB.send(new GetCommand({ TableName: TABLE_NAMES.BOOKINGS, Key: { PK: `BOOKING#${bookingId}`, SK: 'DETAILS' } }))
    const booking = bookingResp.Item
    if (!booking) return errorResponse('Booking not found', 404)

    // Only assigned driver may respond
    if (!booking.driverId || booking.driverId === 'UNASSIGNED' || booking.driverId !== caller.userId) {
      return Responses.unauthorized()
    }

    const now = new Date().toISOString()
    const deadline = booking.confirmationDeadline

    if (booking.status !== 'BOOKING_PENDING' && booking.bookingStatus !== 'BOOKING_PENDING') {
      return errorResponse('Booking is not pending confirmation', 409)
    }
    if (deadline && new Date(deadline) <= new Date()) {
      return errorResponse('Booking confirmation deadline has passed', 409)
    }

    if (action === 'ACCEPT') {
      // Attempt to atomically move to CONFIRMED
      try {
        await dynamoDB.send(new UpdateCommand({
          TableName: TABLE_NAMES.BOOKINGS,
          Key: { PK: `BOOKING#${bookingId}`, SK: 'DETAILS' },
          UpdateExpression: 'SET bookingStatus = :confirmed, #legacyStatus = :confirmed, driverResponseStatus = :accepted, driverResponseAt = :now, statusUpdatedBy = :driver, statusUpdatedAt = :now, confirmedAt = :now, updatedAt = :now',
          ConditionExpression: '(#legacyStatus = :pending OR bookingStatus = :pending) AND confirmationDeadline > :now',
          ExpressionAttributeNames: { '#legacyStatus': 'status' },
          ExpressionAttributeValues: { ':confirmed': 'CONFIRMED', ':pending': 'BOOKING_PENDING', ':accepted': 'ACCEPTED', ':driver': 'DRIVER', ':now': now },
        }))

        try {
          const { createNotification } = await import('../../utils/notifications')
          // notify CGM
          await createNotification(booking.cgmId, 'BOOKING_CONFIRMED', {
            bookingId,
            driverId: caller.userId,
            driverName: caller.name,
            cabId: booking.cabId,
            cabNumber: booking.cabNumber,
            bookingDate: booking.bookingDate,
            startTime: booking.startTime,
            endTime: booking.endTime,
            confirmedAt: now,
          })
        } catch (err) {
          console.warn('Failed to create CGM confirmation notification', err)
        }

        return successResponse({ bookingId, status: 'CONFIRMED', driverResponseStatus: 'ACCEPTED', confirmedAt: now })
      } catch (err: any) {
        console.error('Accept failed', err)
        return errorResponse('Could not confirm booking', 409)
      }
    }

    // REJECT path: update booking and remove slot locks transactionally
    if (action === 'REJECT') {
      const bookingDate = booking.bookingDate
      const startTime = booking.startTime
      const endTime = booking.endTime
      if (!bookingDate || !startTime || !endTime) return errorResponse('Booking times missing', 500)

      const lockPk = `CAB#${booking.cabId}#${bookingDate}`
      const lockTimes = intervalLockTimes({ startTime, endTime })

      const transactItems: any[] = []

      transactItems.push({
        Update: {
          TableName: TABLE_NAMES.BOOKINGS,
          Key: { PK: `BOOKING#${bookingId}`, SK: 'DETAILS' },
          UpdateExpression: 'SET bookingStatus = :rejected, #legacyStatus = :rejected, driverResponseStatus = :rejected_response, driverResponseAt = :now, statusUpdatedBy = :driver, statusUpdatedAt = :now, rejectedAt = :now, updatedAt = :now',
          ConditionExpression: '(#legacyStatus = :pending OR bookingStatus = :pending) AND confirmationDeadline > :now',
          ExpressionAttributeNames: { '#legacyStatus': 'status' },
          ExpressionAttributeValues: { ':rejected': 'REJECTED', ':rejected_response': 'REJECTED', ':pending': 'BOOKING_PENDING', ':driver': 'DRIVER', ':now': now },
        },
      })

      for (const t of lockTimes) {
        transactItems.push({
          Delete: {
            TableName: TABLE_NAMES.SLOTS,
            Key: { PK: lockPk, SK: `LOCK#${t}` },
          },
        })
      }

      try {
        await dynamoDB.send(new TransactWriteCommand({ TransactItems: transactItems }))
        try {
          const { createNotification } = await import('../../utils/notifications')
          await createNotification(booking.cgmId, 'BOOKING_REJECTED', {
            bookingId,
            driverId: caller.userId,
            driverName: caller.name,
            cabId: booking.cabId,
            cabNumber: booking.cabNumber,
            bookingDate: booking.bookingDate,
            startTime: booking.startTime,
            endTime: booking.endTime,
            rejectedAt: now,
          })
        } catch (err) {
          console.warn('Failed to create CGM rejection notification', err)
        }
        return successResponse({ bookingId, status: 'REJECTED', rejectedAt: now })
      } catch (err: any) {
        console.error('Reject transaction failed', err)
        return errorResponse('Could not reject booking', 409)
      }
    }
    return errorResponse('Invalid action')
  } catch (error) {
    console.error('respondBooking failed', error)
    return Responses.serverError()
  }
}

export default handler
