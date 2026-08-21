import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import { requireRole } from '../../utils/auth'
import { errorResponse, successResponse, Responses } from '../../utils/response'

/**
 * POST /cgm/bookings
 *
 * Creates a new cab booking for the authenticated CGM.
 * Uses a DynamoDB transaction to prevent double booking.
 * Only accessible by CGM role.
 */
export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  // 1. Verify the caller is a CGM
  const caller = requireRole(event, ['CGM'])
  if (!caller) return Responses.unauthorized()

  // 2. Parse and validate the request body
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

  // TODO: Phase 5 - implement DynamoDB transaction for double-booking prevention
  return successResponse({ message: 'Coming in Phase 5' })
}
