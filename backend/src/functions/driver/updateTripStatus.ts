import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb'
import { requireRole } from '../../utils/auth'
import { dynamoDB, TABLE_NAMES } from '../../utils/dynamodb'
import { errorResponse, successResponse, Responses } from '../../utils/response'
import type { BookingStatus } from '../../models'

const DRIVER_ALLOWED_STATUSES: BookingStatus[] = [
  'ACCEPTED',
  'ON_THE_WAY',
  'ARRIVED',
  'COMPLETED',
]

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const caller = requireRole(event, ['DRIVER'])
  if (!caller) return Responses.unauthorized()

  const bookingId = event.pathParameters?.bookingId
  if (!bookingId) return errorResponse('bookingId is required')

  let body: { status?: string }
  try {
    body = JSON.parse(event.body || '{}')
  } catch {
    return errorResponse('Invalid request body')
  }

  const { status } = body
  if (!status || !DRIVER_ALLOWED_STATUSES.includes(status as BookingStatus)) {
    return errorResponse(`Status must be one of: ${DRIVER_ALLOWED_STATUSES.join(', ')}`)
  }

  try {
    const bookingResponse = await dynamoDB.send(
      new GetCommand({
        TableName: TABLE_NAMES.BOOKINGS,
        Key: { PK: `BOOKING#${bookingId}`, SK: 'DETAILS' },
      })
    )

    const booking = bookingResponse.Item
    if (!booking) return errorResponse('Booking not found', 404)

    if (booking.driverId !== caller.userId) {
      return Responses.unauthorized()
    }

    const nextStatus = status as BookingStatus
    const nextCabStatus = nextStatus === 'COMPLETED' ? 'AVAILABLE' : nextStatus === 'ACCEPTED' ? 'ASSIGNED' : 'ON_TRIP'

    await dynamoDB.send(
      new UpdateCommand({
        TableName: TABLE_NAMES.BOOKINGS,
        Key: { PK: `BOOKING#${bookingId}`, SK: 'DETAILS' },
        UpdateExpression: 'SET bookingStatus = :status, updatedAt = :updatedAt',
        ExpressionAttributeValues: {
          ':status': nextStatus,
          ':updatedAt': new Date().toISOString(),
        },
      })
    )

    await dynamoDB.send(
      new UpdateCommand({
        TableName: TABLE_NAMES.CABS,
        Key: { PK: `CAB#${booking.cabId}`, SK: 'DETAILS' },
        UpdateExpression: 'SET #status = :status, updatedAt = :updatedAt REMOVE assignedDriverId, assignedDriverName',
        ExpressionAttributeNames: {
          '#status': 'status',
        },
        ExpressionAttributeValues: {
          ':status': nextCabStatus,
          ':updatedAt': new Date().toISOString(),
        },
      })
    )

    return successResponse({ bookingId, status: nextStatus, cabStatus: nextCabStatus })
  } catch (error) {
    console.error('updateTripStatus failed', error)
    return Responses.serverError()
  }
}
