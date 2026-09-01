import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import { requireRole } from '../../utils/auth'
import { Responses, successResponse } from '../../utils/response'
import { seedProjects } from './seedProjects'

/**
 * POST /v1/admin/seed
 * One-time endpoint to seed initial project data.
 * Admin only. Safe to call multiple times (idempotent).
 */
export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const caller = requireRole(event, ['ADMIN'])
  if (!caller) return Responses.unauthorized()

  try {
    await seedProjects()
    return successResponse({ message: '12 initial projects seeded successfully.' })
  } catch (error) {
    console.error('Seed failed', error)
    return Responses.serverError()
  }
}
