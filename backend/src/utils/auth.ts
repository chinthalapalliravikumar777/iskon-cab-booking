import type { APIGatewayProxyEvent } from 'aws-lambda'

export type UserRole = 'CGM' | 'DRIVER' | 'ADMIN'

export interface CallerIdentity {
  userId: string
  email: string
  role: UserRole
  name: string
  mobile: string
}

/**
 * Extract the authenticated user's identity from the API Gateway event.
 *
 * API Gateway + Cognito Authorizer automatically validates the JWT token
 * and injects the claims into event.requestContext.authorizer.jwt.claims.
 * We never need to verify the token manually — API Gateway does it for us.
 */
export function getCallerIdentity(event: APIGatewayProxyEvent): CallerIdentity | null {
  try {
    // For HTTP API with Cognito JWT authorizer
    const claims = (event.requestContext as any)?.authorizer?.jwt?.claims

    if (!claims) return null

    // Cognito puts custom attributes under "custom:role" etc.
    // The user's name is stored in the standard "name" attribute
    const role = (claims['custom:role']) as UserRole
    const userId = claims['sub'] as string
    const email = claims['email'] as string
    const name = (claims['name'] || email) as string
    const mobile = (claims['custom:mobile'] || '') as string

    if (!userId || !role) return null

    return { userId, email, role, name, mobile }
  } catch {
    return null
  }
}

/**
 * Check if the caller has the required role.
 * Use this in every Lambda to enforce role-based access control.
 */
export function requireRole(
  event: APIGatewayProxyEvent,
  allowedRoles: UserRole[]
): CallerIdentity | null {
  const caller = getCallerIdentity(event)
  if (!caller) return null
  if (!allowedRoles.includes(caller.role)) return null
  return caller
}
