import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import { requireRole } from '../../utils/auth'
import { errorResponse, successResponse, Responses } from '../../utils/response'

/**
 * GET /cgm/cabs/available?date=YYYY-MM-DD&slot=HH:MM-HH:MM
 *
 * Returns cabs that are AVAILABLE and not yet booked for the requested date+slot.
 * Only accessible by CGM role.
 */
export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  // 1. Verify the caller is a CGM
  const caller = requireRole(event, ['CGM'])
  if (!caller) return Responses.unauthorized()

  // 2. Validate query parameters
  const { date, slot } = event.queryStringParameters || {}
  if (!date || !slot) {
    return errorResponse('Query parameters "date" and "slot" are required')
  }

  // TODO: Phase 5 - query DynamoDB for available cabs
  return successResponse({ message: 'Coming in Phase 5', date, slot })
}
