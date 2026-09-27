import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import { ScanCommand, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb'
import { requireRole } from '../../utils/auth'
import { dynamoDB, TABLE_NAMES } from '../../utils/dynamodb'
import { errorResponse, successResponse, Responses } from '../../utils/response'

/**
 * GET /v1/admin/bookings
 *   Returns ALL bookings in the system. No cgmId filter. Admin sees everything.
 *   Optional query params:
 *     status   - filter by bookingStatus (comma-separated, e.g. BOOKED,ACCEPTED)
 *     date     - filter by bookingDate (YYYY-MM-DD)
 *     cabId    - filter by cab
 *     driverId - filter by driver
 *     cgmId    - filter by CGM
 *
 * GET /v1/admin/bookings/{bookingId}
 *   Returns the full booking record including cgmMobile and driverMobile.
 *
 * PATCH /v1/admin/bookings/{bookingId}
 *   Admin can update bookingStatus to: CANCELLED, ACCEPTED, COMPLETED, BOOKED
 *   Used to cancel a booking or manually release a stalled booking.
 */
export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  // Only ADMIN can access this endpoint — enforced on the backend, not just UI
  const caller = requireRole(event, ['ADMIN'])
  if (!caller) return Responses.unauthorized()

  const method = (event as any).requestContext?.http?.method || event.httpMethod || 'GET'
  const bookingId = event.pathParameters?.bookingId

  // ── GET single booking ──────────────────────────────────────────────────
  if (method === 'GET' && bookingId) {
    try {
      const result = await dynamoDB.send(new GetCommand({
        TableName: TABLE_NAMES.BOOKINGS,
        Key: { PK: `BOOKING#${bookingId}`, SK: 'DETAILS' },
      }))

      if (!result.Item) return Responses.notFound('Booking')

      console.log(`[Admin getBooking] adminId=${caller.userId} bookingId=${bookingId}`)
      return successResponse(result.Item)
    } catch (error) {
      console.error('admin getBooking failed', error)
      return Responses.serverError()
    }
  }

  // ── PATCH booking status (cancel, reassign, etc.) ───────────────────────
  if (method === 'PATCH' && bookingId) {
    let body: { bookingStatus?: string; driverId?: string; driverName?: string; driverMobile?: string; cabId?: string; cabNumber?: string }
    try {
      body = JSON.parse(event.body || '{}')
    } catch {
      return errorResponse('Invalid request body')
    }

    const ADMIN_ALLOWED_STATUSES = ['BOOKED', 'ACCEPTED', 'CANCELLED', 'COMPLETED']
    if (body.bookingStatus && !ADMIN_ALLOWED_STATUSES.includes(body.bookingStatus)) {
      return errorResponse(`bookingStatus must be one of: ${ADMIN_ALLOWED_STATUSES.join(', ')}`)
    }

    try {
      const existing = await dynamoDB.send(new GetCommand({
        TableName: TABLE_NAMES.BOOKINGS,
        Key: { PK: `BOOKING#${bookingId}`, SK: 'DETAILS' },
      }))
      if (!existing.Item) return Responses.notFound('Booking')

      const now = new Date().toISOString()
      const updates: string[] = ['updatedAt = :updatedAt']
      const values: Record<string, unknown> = { ':updatedAt': now }
      const names: Record<string, string> = {}

      if (body.bookingStatus) {
        updates.push('#bookingStatus = :bookingStatus')
        names['#bookingStatus'] = 'bookingStatus'
        values[':bookingStatus'] = body.bookingStatus
      }
      if (body.driverId)     { updates.push('driverId = :driverId');         values[':driverId'] = body.driverId }
      if (body.driverName)   { updates.push('driverName = :driverName');     values[':driverName'] = body.driverName }
      if (body.driverMobile) { updates.push('driverMobile = :driverMobile'); values[':driverMobile'] = body.driverMobile }
      if (body.cabId)        { updates.push('cabId = :cabId');               values[':cabId'] = body.cabId }
      if (body.cabNumber)    { updates.push('cabNumber = :cabNumber');       values[':cabNumber'] = body.cabNumber }

      const result = await dynamoDB.send(new UpdateCommand({
        TableName: TABLE_NAMES.BOOKINGS,
        Key: { PK: `BOOKING#${bookingId}`, SK: 'DETAILS' },
        UpdateExpression: `SET ${updates.join(', ')}`,
        ExpressionAttributeNames: Object.keys(names).length ? names : undefined,
        ExpressionAttributeValues: values,
        ReturnValues: 'ALL_NEW',
      }))

      console.log(`[Admin patchBooking] adminId=${caller.userId} bookingId=${bookingId} status=${body.bookingStatus}`)
      return successResponse(result.Attributes)
    } catch (error) {
      console.error('admin patchBooking failed', error)
      return Responses.serverError()
    }
  }

  // ── GET all bookings ────────────────────────────────────────────────────
  if (method === 'GET') {
    try {
      const { status, date, cabId, driverId, cgmId } = event.queryStringParameters || {}

      // Scan the entire bookings table — Admin sees all records
      // For a low-volume internal app (25 CGMs, 7 cabs) this is fine.
      // If bookings grow large, add a GSI on createdAt for efficient pagination.
      const scanResult = await dynamoDB.send(new ScanCommand({
        TableName: TABLE_NAMES.BOOKINGS,
      }))

      let bookings = (scanResult.Items || [])

      // Apply optional filters server-side
      // These are AND filters — each narrows the result set
      if (status) {
        const statuses = status.split(',').map(s => s.trim().toUpperCase())
        bookings = bookings.filter(b => statuses.includes((b.bookingStatus || '').toUpperCase()))
      }
      if (date) {
        bookings = bookings.filter(b => b.bookingDate === date)
      }
      if (cabId) {
        bookings = bookings.filter(b => b.cabId === cabId)
      }
      if (driverId) {
        bookings = bookings.filter(b => b.driverId === driverId)
      }
      if (cgmId) {
        bookings = bookings.filter(b => b.cgmId === cgmId)
      }

      // Sort newest bookings first (descending createdAt)
      bookings.sort((a, b) => {
        const tA = a.createdAt || ''
        const tB = b.createdAt || ''
        return tB.localeCompare(tA)
      })

      console.log(`[Admin getBookings] adminId=${caller.userId} filters={status=${status},date=${date},cabId=${cabId},driverId=${driverId},cgmId=${cgmId}} returned=${bookings.length}`)

      return successResponse({
        bookings,
        count: bookings.length,
      })
    } catch (error) {
      console.error('admin getBookings failed', error)
      return Responses.serverError()
    }
  }

  return errorResponse('Method not allowed', 405)
}
