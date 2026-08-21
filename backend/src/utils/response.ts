import type { APIGatewayProxyResult } from 'aws-lambda'

// CORS headers - required so the browser allows the frontend to call the API
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': process.env.FRONTEND_URL || '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
  'Content-Type': 'application/json',
}

/**
 * Build a successful API response.
 * @param data - The data to return to the client
 * @param statusCode - HTTP status code (default 200)
 */
export function successResponse(data: unknown, statusCode = 200): APIGatewayProxyResult {
  return {
    statusCode,
    headers: CORS_HEADERS,
    body: JSON.stringify({ success: true, data }),
  }
}

/**
 * Build an error API response.
 * @param message - Human-readable error message
 * @param statusCode - HTTP status code (default 400)
 */
export function errorResponse(message: string, statusCode = 400): APIGatewayProxyResult {
  return {
    statusCode,
    headers: CORS_HEADERS,
    body: JSON.stringify({ success: false, error: message }),
  }
}

/**
 * Standard responses for common cases.
 */
export const Responses = {
  notFound: (resource = 'Resource') =>
    errorResponse(`${resource} not found`, 404),

  unauthorized: () =>
    errorResponse('You are not authorized to perform this action', 403),

  unauthenticated: () =>
    errorResponse('Authentication required', 401),

  serverError: () =>
    errorResponse('An internal server error occurred', 500),

  conflict: (message: string) =>
    errorResponse(message, 409),
}
