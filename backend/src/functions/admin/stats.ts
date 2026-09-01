import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import { ScanCommand } from '@aws-sdk/lib-dynamodb'
import {
  CognitoIdentityProviderClient,
  ListUsersCommand,
} from '@aws-sdk/client-cognito-identity-provider'
import { requireRole } from '../../utils/auth'
import { dynamoDB, TABLE_NAMES } from '../../utils/dynamodb'
import { successResponse, Responses } from '../../utils/response'

const cognitoClient = new CognitoIdentityProviderClient({})

/**
 * GET /v1/admin/stats
 * Returns live counts for the admin dashboard.
 */
export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const caller = requireRole(event, ['ADMIN'])
  if (!caller) return Responses.unauthorized()

  try {
    // Run all queries in parallel
    const [cabsResult, bookingsResult, usersResult] = await Promise.all([
      dynamoDB.send(new ScanCommand({
        TableName: TABLE_NAMES.CABS,
        Select: 'ALL_ATTRIBUTES',
      })),
      dynamoDB.send(new ScanCommand({
        TableName: TABLE_NAMES.BOOKINGS,
        Select: 'SPECIFIC_ATTRIBUTES',
        ProjectionExpression: 'bookingId, bookingStatus, #st, bookingDate',
        ExpressionAttributeNames: { '#st': 'status' },
      })),
      cognitoClient.send(new ListUsersCommand({
        UserPoolId: process.env.USER_POOL_ID,
        Limit: 60,
      })),
    ])

    const cabs = cabsResult.Items || []
    const bookings = bookingsResult.Items || []
    const cognitoUsers = (usersResult.Users || []).map(u => {
      const attrs = Object.fromEntries((u.Attributes || []).map(a => [a.Name, a.Value || '']))
      return { role: attrs['custom:role'], enabled: u.Enabled }
    })

    const cabStats = {
      total: cabs.length,
      available: cabs.filter(c => c.status === 'AVAILABLE').length,
      onTrip: cabs.filter(c => c.status === 'ON_TRIP').length,
      maintenance: cabs.filter(c => c.status === 'MAINTENANCE').length,
      inactive: cabs.filter(c => c.status === 'INACTIVE').length,
    }

    // For bookings, check both field names
    const activeStatuses = ['BOOKING_PENDING', 'CONFIRMED', 'ACCEPTED', 'ON_THE_WAY', 'ON_SITE', 'ARRIVED']
    const getStatus = (b: any) => b.bookingStatus || b.status || ''

    const today = new Date().toISOString().split('T')[0]
    const bookingStats = {
      total: bookings.length,
      active: bookings.filter(b => activeStatuses.includes(getStatus(b))).length,
      completedToday: bookings.filter(b => getStatus(b) === 'COMPLETED' && b.bookingDate === today).length,
      today: bookings.filter(b => b.bookingDate === today).length,
    }

    const userStats = {
      cgms: cognitoUsers.filter(u => u.role === 'CGM' && u.enabled).length,
      drivers: cognitoUsers.filter(u => u.role === 'DRIVER' && u.enabled).length,
    }

    return successResponse({ cabs: cabStats, bookings: bookingStats, users: userStats })
  } catch (error) {
    console.error('admin stats failed', error)
    return Responses.serverError()
  }
}
