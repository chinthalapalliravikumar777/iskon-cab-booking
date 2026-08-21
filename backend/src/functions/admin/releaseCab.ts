import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import { requireRole } from '../../utils/auth'
import { errorResponse, successResponse, Responses } from '../../utils/response'

/**
 * PATCH /admin/cabs/{cabId}/status
 *
 * Allows an admin to manually release a cab back to AVAILABLE.
 * Used when a driver forgets to mark a trip as COMPLETED.
 * Only accessible by ADMIN role.
 */
export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  // 1. Verify the caller is an ADMIN
  const caller = requireRole(event, ['ADMIN'])
  if (!caller) return Responses.unauthorized()

  // 2. Get cabId from path
  const cabId = event.pathParameters?.cabId
  if (!cabId) return errorResponse('cabId is required')

  // 3. Parse optional body for reason
  let body: { status?: string; reason?: string }
  try {
    body = JSON.parse(event.body || '{}')
  } catch {
    return errorResponse('Invalid request body')
  }

  const newStatus = body.status || 'AVAILABLE'
  const validStatuses = ['AVAILABLE', 'MAINTENANCE', 'INACTIVE']
  if (!validStatuses.includes(newStatus)) {
    return errorResponse(`Status must be one of: ${validStatuses.join(', ')}`)
  }

  // TODO: Phase 5 - update DynamoDB cab status
  return successResponse({ message: 'Coming in Phase 5', cabId, newStatus })
}
