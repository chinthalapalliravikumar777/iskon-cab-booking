import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import { GetCommand, QueryCommand, ScanCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb'
import { requireRole } from '../../utils/auth'
import { dynamoDB, TABLE_NAMES } from '../../utils/dynamodb'
import { errorResponse, successResponse, Responses } from '../../utils/response'
import { intervalLockTimes } from '../../utils/bookingTime'
import { createNotification } from '../../utils/notifications'

/**
 * Admin bookings handler.
 * GET  /v1/admin/bookings           — list all bookings (with optional ?date= or ?status= filter)
 * PATCH /v1/admin/bookings/{id}     — admin booking actions
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

      const items: Record<string, any>[] = []
      let lastEvaluatedKey: Record<string, unknown> | undefined
      do {
        scanParams.ExclusiveStartKey = lastEvaluatedKey
        const result = await dynamoDB.send(new ScanCommand(scanParams))
        items.push(...((result.Items || []) as Record<string, any>[]))
        lastEvaluatedKey = result.LastEvaluatedKey
      } while (lastEvaluatedKey)
      items.sort((a, b) => {
        const dateA = a.bookingDate || ''
        const dateB = b.bookingDate || ''
        if (dateA !== dateB) return dateB.localeCompare(dateA)
        return (b.createdAt || '').localeCompare(a.createdAt || '')
      })
      console.info('adminListBookings', { userId: caller.userId, role: caller.role, filters: { date, status, driverId, cgmId }, count: items.length })

      return successResponse(items)
    } catch (error) {
      console.error('adminListBookings failed', { userId: caller.userId, error })
      return Responses.serverError()
    }
  }

  // ── PATCH — admin actions on bookings ────────────────────────────────────
  if (method === 'PATCH') {
    if (!bookingId) return errorResponse('bookingId is required')

    let body: { action?: 'CANCEL' | 'COMPLETE' | 'ACCEPT' | 'REJECT' | 'REASSIGN'; reason?: string; cabId?: string }
    try {
      body = JSON.parse(event.body || '{}')
    } catch {
      return errorResponse('Invalid request body')
    }

    const { action, reason, cabId } = body
    if (!['CANCEL', 'COMPLETE', 'ACCEPT', 'REJECT', 'REASSIGN'].includes(action || '')) {
      return errorResponse('Action must be CANCEL, COMPLETE, ACCEPT, REJECT, or REASSIGN')
    }

    try {
      const bookingResp = await dynamoDB.send(new GetCommand({
        TableName: TABLE_NAMES.BOOKINGS,
        Key: { PK: `BOOKING#${bookingId}`, SK: 'DETAILS' },
      }))

      const booking = bookingResp.Item
      if (!booking) return errorResponse('Booking not found', 404)

      const currentStatus = booking.bookingStatus || booking.status || ''
      const now = new Date().toISOString()

      // ACCEPT action — admins can take over pending requests after the driver window expires.
      if (action === 'ACCEPT') {
        if (!['BOOKING_PENDING', 'EXPIRED'].includes(currentStatus)) {
          return errorResponse(`Cannot accept booking with status ${currentStatus}.`, 409)
        }

        const cabResp = await dynamoDB.send(new GetCommand({
          TableName: TABLE_NAMES.CABS,
          Key: { PK: `CAB#${booking.cabId}`, SK: 'DETAILS' },
        }))
        const cab = cabResp.Item
        const driverId = booking.driverId !== 'UNASSIGNED' ? booking.driverId : cab?.assignedDriverId
        const driverName = booking.driverName !== 'Pending Assignment' ? booking.driverName : cab?.assignedDriverName
        const transactItems: any[] = [{
          Update: {
            TableName: TABLE_NAMES.BOOKINGS,
            Key: { PK: `BOOKING#${bookingId}`, SK: 'DETAILS' },
            UpdateExpression: 'SET bookingStatus = :confirmed, #st = :confirmed, driverResponseStatus = :accepted, driverResponseAt = :now, respondedBy = :admin, statusUpdatedBy = :admin, statusUpdatedAt = :now, updatedAt = :now, driverId = :driverId, driverName = :driverName',
            ExpressionAttributeNames: { '#st': 'status' },
            ExpressionAttributeValues: {
              ':confirmed': 'CONFIRMED', ':accepted': 'ACCEPTED', ':admin': 'ADMIN', ':now': now,
              ':driverId': driverId || 'UNASSIGNED', ':driverName': driverName || 'Pending Assignment',
            },
          },
        }]
        if (cab && cab.status === 'AVAILABLE') {
          transactItems.push({
            Update: {
              TableName: TABLE_NAMES.CABS,
              Key: { PK: `CAB#${booking.cabId}`, SK: 'DETAILS' },
              UpdateExpression: 'SET #status = :assigned, updatedAt = :now',
              ExpressionAttributeNames: { '#status': 'status' },
              ExpressionAttributeValues: { ':assigned': 'ASSIGNED', ':now': now },
            },
          })
        }
        await dynamoDB.send(new TransactWriteCommand({ TransactItems: transactItems }))

        // Notify CGM that admin accepted
        try {
          await createNotification(booking.cgmId, 'BOOKING_CONFIRMED', {
            bookingId,
            cabNumber: booking.cabNumber,
            bookingDate: booking.bookingDate,
            startTime: booking.startTime,
            endTime: booking.endTime,
            confirmedAt: now,
            adminName: caller.name,
            driverName,
            driverMobile: booking.driverMobile || cab?.assignedDriverMobile || '',
          }).catch(() => {})
          if (driverId && driverId !== 'UNASSIGNED') {
            await createNotification(driverId, 'BOOKING_CONFIRMED_ADMIN', {
              bookingId,
              cgmName: booking.cgmName,
              cgmMobile: booking.cgmMobile || '',
              projectName: booking.projectName || booking.siteLocation,
              cabNumber: booking.cabNumber,
              bookingDate: booking.bookingDate,
              startTime: booking.startTime,
              endTime: booking.endTime,
              adminName: caller.name,
            }).catch(() => {})
          }
        } catch (_) { /* non-critical */ }

        return successResponse({ bookingId, status: 'CONFIRMED', driverResponseStatus: 'ACCEPTED', driverId, driverName })
      }

      // REJECT action — admin rejects an expired/pending booking
      if (action === 'REJECT') {
        if (!['BOOKING_PENDING', 'EXPIRED'].includes(currentStatus)) {
          return errorResponse(`Cannot reject booking with status ${currentStatus}.`, 409)
        }

        const lockPk = `CAB#${booking.cabId}#${booking.bookingDate}`
        const lockTimes = booking.startTime && booking.endTime
          ? intervalLockTimes({ startTime: booking.startTime, endTime: booking.endTime })
          : []

        const transactItems: any[] = [
          {
            Update: {
              TableName: TABLE_NAMES.BOOKINGS,
              Key: { PK: `BOOKING#${bookingId}`, SK: 'DETAILS' },
              UpdateExpression: 'SET bookingStatus = :rejected, #st = :rejected, driverResponseStatus = :rejected_response, statusUpdatedBy = :admin, statusUpdatedAt = :now, updatedAt = :now, rejectionReason = :reason',
              ExpressionAttributeNames: { '#st': 'status' },
              ExpressionAttributeValues: {
                ':rejected': 'REJECTED',
                ':rejected_response': 'REJECTED',
                ':admin': 'ADMIN',
                ':now': now,
                ':reason': reason || 'Rejected by admin',
              },
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

        // Notify CGM that admin rejected
        try {
          await createNotification(booking.cgmId, 'BOOKING_REJECTED', {
            bookingId,
            cabNumber: booking.cabNumber,
            bookingDate: booking.bookingDate,
            startTime: booking.startTime,
            endTime: booking.endTime,
            adminName: caller.name,
            reason: reason || 'Rejected by admin',
          }).catch(() => {})
          if (booking.driverId && booking.driverId !== 'UNASSIGNED') {
            await createNotification(booking.driverId, 'BOOKING_REJECTED_ADMIN', {
              bookingId,
              cgmName: booking.cgmName,
              projectName: booking.projectName || booking.siteLocation,
              cabNumber: booking.cabNumber,
              bookingDate: booking.bookingDate,
              startTime: booking.startTime,
              endTime: booking.endTime,
              adminName: caller.name,
              reason: reason || 'Rejected by admin',
            }).catch(() => {})
          }
        } catch (_) { /* non-critical */ }

        return successResponse({ bookingId, status: 'REJECTED', driverResponseStatus: 'REJECTED' })
      }

      if (action === 'REASSIGN') {
        if (!cabId || cabId === booking.cabId) return errorResponse('A different cabId is required for reassignment')
        if (['COMPLETED', 'CANCELLED', 'REJECTED'].includes(currentStatus)) {
          return errorResponse(`Booking is already ${currentStatus} and cannot be reassigned`, 409)
        }

        const newCabResp = await dynamoDB.send(new GetCommand({
          TableName: TABLE_NAMES.CABS,
          Key: { PK: `CAB#${cabId}`, SK: 'DETAILS' },
        }))
        const newCab = newCabResp.Item
        if (!newCab || !['AVAILABLE', 'ASSIGNED'].includes(newCab.status)) {
          return errorResponse('The selected cab is not available for reassignment', 409)
        }

        const cabBookings = await dynamoDB.send(new QueryCommand({
          TableName: TABLE_NAMES.BOOKINGS,
          IndexName: 'cab-slot-index',
          KeyConditionExpression: 'cabId = :cabId AND begins_with(bookingDateSlot, :date)',
          ExpressionAttributeValues: { ':cabId': cabId, ':date': `${booking.bookingDate}#` },
        }))
        if ((cabBookings.Items || []).some(item => item.bookingId !== bookingId)) {
          return errorResponse('The selected cab already has a booking on this date', 409)
        }

        const oldLockPk = `CAB#${booking.cabId}#${booking.bookingDate}`
        const newLockPk = `CAB#${cabId}#${booking.bookingDate}`
        const lockTimes = booking.startTime && booking.endTime
          ? intervalLockTimes({ startTime: booking.startTime, endTime: booking.endTime })
          : []
        const transactItems: any[] = [{
          Update: {
            TableName: TABLE_NAMES.BOOKINGS,
            Key: { PK: `BOOKING#${bookingId}`, SK: 'DETAILS' },
            UpdateExpression: 'SET cabId = :cabId, cabNumber = :cabNumber, driverId = :driverId, driverName = :driverName, updatedAt = :now, statusUpdatedBy = :admin, statusUpdatedAt = :now',
            ExpressionAttributeValues: {
              ':cabId': cabId, ':cabNumber': newCab.cabNumber,
              ':driverId': newCab.assignedDriverId || 'UNASSIGNED',
              ':driverName': newCab.assignedDriverName || 'Pending Assignment',
              ':now': now, ':admin': 'ADMIN',
            },
          },
        }, {
          Update: {
            TableName: TABLE_NAMES.CABS,
            Key: { PK: `CAB#${booking.cabId}`, SK: 'DETAILS' },
            UpdateExpression: 'SET #status = :available, updatedAt = :now',
            ExpressionAttributeNames: { '#status': 'status' },
            ExpressionAttributeValues: { ':available': 'AVAILABLE', ':now': now },
          },
        }, {
          Update: {
            TableName: TABLE_NAMES.CABS,
            Key: { PK: `CAB#${cabId}`, SK: 'DETAILS' },
            UpdateExpression: 'SET #status = :assigned, updatedAt = :now',
            ExpressionAttributeNames: { '#status': 'status' },
            ExpressionAttributeValues: { ':assigned': 'ASSIGNED', ':now': now },
          },
        },
          ...lockTimes.map(t => ({ Delete: { TableName: TABLE_NAMES.SLOTS, Key: { PK: oldLockPk, SK: `LOCK#${t}` } } })),
          ...lockTimes.map(t => ({ Put: { TableName: TABLE_NAMES.SLOTS, Item: { PK: newLockPk, SK: `LOCK#${t}`, bookingId, createdAt: now }, ConditionExpression: 'attribute_not_exists(PK)' } })),
        ]
        await dynamoDB.send(new TransactWriteCommand({ TransactItems: transactItems }))
        return successResponse({ bookingId, status: currentStatus, cabId, cabNumber: newCab.cabNumber })
      }

      // CANCEL and COMPLETE actions
      const terminalStatuses = ['COMPLETED', 'CANCELLED', 'REJECTED']
      if (terminalStatuses.includes(currentStatus)) {
        return errorResponse(`Booking is already ${currentStatus} and cannot be changed`, 409)
      }

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
              UpdateExpression: 'SET bookingStatus = :status, #st = :status, statusUpdatedBy = :admin, statusUpdatedAt = :now, cancelledAt = :now, updatedAt = :now, cancelReason = :reason',
              ExpressionAttributeNames: { '#st': 'status' },
              ExpressionAttributeValues: {
                ':status': 'CANCELLED',
                ':admin': 'ADMIN',
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
        // Force complete atomically, but preserve the cab's permanent driver assignment.
        await dynamoDB.send(new TransactWriteCommand({ TransactItems: [
          {
            Update: {
              TableName: TABLE_NAMES.BOOKINGS,
              Key: { PK: `BOOKING#${bookingId}`, SK: 'DETAILS' },
              UpdateExpression: 'SET bookingStatus = :status, #st = :status, statusUpdatedBy = :admin, statusUpdatedAt = :now, completedAt = :now, updatedAt = :now',
              ExpressionAttributeNames: { '#st': 'status' },
              ExpressionAttributeValues: { ':status': 'COMPLETED', ':admin': 'ADMIN', ':now': now },
            },
          },
          {
            Update: {
              TableName: TABLE_NAMES.CABS,
              Key: { PK: `CAB#${booking.cabId}`, SK: 'DETAILS' },
              UpdateExpression: 'SET #status = :available, updatedAt = :now',
              ExpressionAttributeNames: { '#status': 'status' },
              ExpressionAttributeValues: { ':available': 'AVAILABLE', ':now': now },
            },
          },
        ] }))
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
        return errorResponse('Could not update booking — concurrent update. Please try again.', 409)
      }
      console.error('adminUpdateBooking failed', error)
      return Responses.serverError()
    }
  }

  return errorResponse('Method not supported', 405)
}
