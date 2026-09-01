import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import { GetCommand, ScanCommand, UpdateCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb'
import { requireRole } from '../../utils/auth'
import { dynamoDB, TABLE_NAMES } from '../../utils/dynamodb'
import { errorResponse, successResponse, Responses } from '../../utils/response'
import { intervalLockTimes } from '../../utils/bookingTime'
import { createNotification } from '../../utils/notifications'

/**
 * Admin bookings handler.
 * GET  /v1/admin/bookings           — list all bookings (with optional ?date= or ?status= filter)
 * PATCH /v1/admin/bookings/{id}     — cancel or force-complete a booking
 */
export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const caller = requireRole(event, ['ADMIN'])
  if (!caller) return Responses.unauthorized()

  const method = (event as any).requestContext?.http?.method || event.httpMethod || 'GET'
  const bookingId = event.pathParameters?.bookingId

  // ── GET all bookings ──────────────────────────────────────────────────────
  if (method === 'GET') {
    try {
      const { date, status, driverId, cgmId } = event.queryStringParameters || {}

      const scanParams: any = {
        TableName: TABLE_NAMES.BOOKINGS,
        Select: 'ALL_ATTRIBUTES',
      }

      // Build filter expression dynamically
      const filters: string[] = []
      const names: Record<string, string> = {}
      const values: Record<string, string> = {}

      if (date) {
        filters.push('bookingDate = :date')
        values[':date'] = date
      }
      if (status) {
        filters.push('(bookingStatus = :status OR #st = :status)')
        names['#st'] = 'status'
        values[':status'] = status
      }
      if (driverId) {
        filters.push('driverId = :driverId')
        values[':driverId'] = driverId
      }
      if (cgmId) {
        filters.push('cgmId = :cgmId')
        values[':cgmId'] = cgmId
      }

      if (filters.length > 0) {
        scanParams.FilterExpression = filters.join(' AND ')
        if (Object.keys(names).length > 0) scanParams.ExpressionAttributeNames = names
        scanParams.ExpressionAttributeValues = values
      }

      const result = await dynamoDB.send(new ScanCommand(scanParams))
      const items = (result.Items || []).sort((a, b) => {
        const dateA = a.bookingDate || ''
        const dateB = b.bookingDate || ''
        if (dateA !== dateB) return dateB.localeCompare(dateA)
        return (b.createdAt || '').localeCompare(a.createdAt || '')
      })

      return successResponse(items)
    } catch (error) {
      console.error('adminListBookings failed', error)
      return Responses.serverError()
    }
  }

  // ── PATCH — cancel or force-complete ─────────────────────────────────────
  if (method === 'PATCH') {
    if (!bookingId) return errorResponse('bookingId is required')

    let body: { action?: 'CANCEL' | 'COMPLETE'; reason?: string }
    try {
      body = JSON.parse(event.body || '{}')
    } catch {
      return errorResponse('Invalid request body')
    }

    const { action, reason } = body
    if (action !== 'CANCEL' && action !== 'COMPLETE') {
      return errorResponse('Action must be CANCEL or COMPLETE')
    }

    try {
      const bookingResp = await dynamoDB.send(new GetCommand({
        TableName: TABLE_NAMES.BOOKINGS,
        Key: { PK: `BOOKING#${bookingId}`, SK: 'DETAILS' },
      }))

      const booking = bookingResp.Item
      if (!booking) return errorResponse('Booking not found', 404)

      const currentStatus = booking.bookingStatus || booking.status || ''
      const terminalStatuses = ['COMPLETED', 'CANCELLED', 'REJECTED', 'EXPIRED']
      if (terminalStatuses.includes(currentStatus)) {
        return errorResponse(`Booking is already ${currentStatus} and cannot be changed`, 409)
      }

      const now = new Date().toISOString()
      const newStatus = action === 'CANCEL' ? 'CANCELLED' : 'COMPLETED'

      if (action === 'CANCEL') {
        // Cancel: update booking + delete slot locks + make cab available — all in transaction
        const lockPk = `CAB#${booking.cabId}#${booking.bookingDate}`
        const lockTimes = booking.startTime && booking.endTime
          ? intervalLockTimes({ startTime: booking.startTime, endTime: booking.endTime })
          : []

        const transactItems: any[] = [
          {
            Update: {
              TableName: TABLE_NAMES.BOOKINGS,
              Key: { PK: `BOOKING#${bookingId}`, SK: 'DETAILS' },
              UpdateExpression: 'SET bookingStatus = :status, #st = :status, cancelledAt = :now, updatedAt = :now, cancelReason = :reason',
              ExpressionAttributeNames: { '#st': 'status' },
              ExpressionAttributeValues: {
                ':status': 'CANCELLED',
                ':now': now,
                ':reason': reason || 'Cancelled by admin',
              },
            },
          },
          {
            Update: {
              TableName: TABLE_NAMES.CABS,
              Key: { PK: `CAB#${booking.cabId}`, SK: 'DETAILS' },
              UpdateExpression: 'SET #status = :available, updatedAt = :now',
              ConditionExpression: 'attribute_exists(PK)',
              ExpressionAttributeNames: { '#status': 'status' },
              ExpressionAttributeValues: { ':available': 'AVAILABLE', ':now': now },
            },
          },
          ...lockTimes.map(t => ({
            Delete: {
              TableName: TABLE_NAMES.SLOTS,
              Key: { PK: lockPk, SK: `LOCK#${t}` },
            },
          })),
        ]

        await dynamoDB.send(new TransactWriteCommand({ TransactItems: transactItems }))
      } else {
        // Force complete: just update booking + make cab available
        await dynamoDB.send(new UpdateCommand({
          TableName: TABLE_NAMES.BOOKINGS,
          Key: { PK: `BOOKING#${bookingId}`, SK: 'DETAILS' },
          UpdateExpression: 'SET bookingStatus = :status, #st = :status, completedAt = :now, updatedAt = :now',
          ExpressionAttributeNames: { '#st': 'status' },
          ExpressionAttributeValues: { ':status': 'COMPLETED', ':now': now },
        }))
        await dynamoDB.send(new UpdateCommand({
          TableName: TABLE_NAMES.CABS,
          Key: { PK: `CAB#${booking.cabId}`, SK: 'DETAILS' },
          UpdateExpression: 'SET #status = :available, updatedAt = :now REMOVE assignedDriverId, assignedDriverName',
          ExpressionAttributeNames: { '#status': 'status' },
          ExpressionAttributeValues: { ':available': 'AVAILABLE', ':now': now },
        }))
      }

      // Notify CGM and driver (non-blocking)
      try {
        const notifMsg = action === 'CANCEL' ? 'BOOKING_CANCELLED_ADMIN' : 'BOOKING_COMPLETED_ADMIN'
        const notifPayload = { bookingId, cabNumber: booking.cabNumber, bookingDate: booking.bookingDate, startTime: booking.startTime, endTime: booking.endTime, reason: reason || '', adminName: caller.name }
        if (booking.cgmId) await createNotification(booking.cgmId, notifMsg, notifPayload).catch(() => {})
        if (booking.driverId && booking.driverId !== 'UNASSIGNED') await createNotification(booking.driverId, notifMsg, notifPayload).catch(() => {})
      } catch (_) { /* non-critical */ }

      return successResponse({ bookingId, status: newStatus })
    } catch (error: any) {
      if (error?.name === 'TransactionCanceledException') {
        return errorResponse('Could not cancel booking — concurrent update. Please try again.', 409)
      }
      console.error('adminUpdateBooking failed', error)
      return Responses.serverError()
    }
  }

  return errorResponse('Method not supported', 405)
}
