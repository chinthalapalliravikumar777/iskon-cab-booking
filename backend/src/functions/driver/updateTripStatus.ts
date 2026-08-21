import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import { requireRole } from '../../utils/auth'
import { errorResponse, successResponse, Responses } from '../../utils/response'
import type { BookingStatus } from '../../models'

// The only statuses a driver can set (in order)
const DRIVER_ALLOWED_STATUSES: BookingStatus[] = [
  'ACCEPTED',
  'ON_THE_WAY',
  'ARRIVED',
  'COMPLETED',
]

/**
 * PATCH /driver/trips/{bookingId}/status
 *
 * Allows a driver to update the status of their assigned trip.
 * When the driver sets COMPLETED, the cab is released back to AVAILABLE.
 * Only the driver assigned to this booking can update its status.
 */
export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  // 1. Verify the caller is a DRIVER
  const caller = requireRole(event, ['DRIVER'])
  if (!caller) return Responses.unauthorized()

  // 2. Get bookingId from path
  const bookingId = event.pathParameters?.bookingId
  if (!bookingId) return errorResponse('bookingId is required')

  // 3. Parse and validate the new status
  let body: { status?: string }
  try {
    body = JSON.parse(event.body || '{}')
  } catch {
    return errorResponse('Invalid request body')
  }

  const { status } = body
  if (!status || !DRIVER_ALLOWED_STATUSES.includes(status as BookingStatus)) {
    return errorResponse(
      `Status must be one of: ${DRIVER_ALLOWED_STATUSES.join(', ')}`
    )
  }

  // TODO: Phase 5 - update DynamoDB, release cab if COMPLETED
  return successResponse({ message: 'Coming in Phase 5', bookingId, status })
}
