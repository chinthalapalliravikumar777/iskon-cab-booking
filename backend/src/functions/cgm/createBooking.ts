import { randomUUID } from 'crypto'
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import { GetCommand, QueryCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb'
import { requireRole } from '../../utils/auth'
import { dynamoDB, TABLE_NAMES } from '../../utils/dynamodb'
import { errorResponse, successResponse, Responses } from '../../utils/response'
import { intervalLockTimes, intervalOverlaps, validateInterval } from '../../utils/bookingTime'

/**
 * POST /cgm/bookings
 *
 * Creates a new cab booking for the authenticated CGM.
 * Uses a DynamoDB transaction to prevent double booking.
 * Only accessible by CGM role.
 */
export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const caller = requireRole(event, ['CGM'])
  if (!caller) return Responses.unauthorized()

  let body: { cabId?: string; bookingDate?: string; timeSlot?: string; startTime?: string; endTime?: string; siteLocation?: string; projectId?: string; projectName?: string; projectLocation?: string; pickupDetails?: string }
  try {
    body = JSON.parse(event.body || '{}')
  } catch {
    return errorResponse('Invalid request body')
  }

  const { cabId, bookingDate, siteLocation, projectId, pickupDetails } = body
  const [legacyStart, legacyEnd] = body.timeSlot?.split('-') || []
  const startTime = body.startTime || legacyStart
  const endTime = body.endTime || legacyEnd
  const timeSlot = startTime && endTime ? `${startTime}-${endTime}` : body.timeSlot
  if (!cabId || !bookingDate || !startTime || !endTime || !siteLocation) {
    return errorResponse('cabId, bookingDate, startTime, endTime, and siteLocation are all required')
  }
  const intervalError = validateInterval({ startTime, endTime })
  if (intervalError) return errorResponse(intervalError)

  try {
    const cabKey = `CAB#${cabId}`
    const cabResponse = await dynamoDB.send(
      new GetCommand({
        TableName: TABLE_NAMES.CABS,
        Key: { PK: cabKey, SK: 'DETAILS' },
      })
    )

    const cab = cabResponse.Item
    if (!cab) {
      return errorResponse('Cab not found', 404)
    }

    if (!['AVAILABLE', 'ASSIGNED'].includes(cab.status)) {
      return errorResponse('Cab is not currently available for booking', 409)
    }

    let project: Record<string, any> | undefined
    if (projectId) {
      const projectResult = await dynamoDB.send(new GetCommand({
        TableName: TABLE_NAMES.PROJECTS,
        Key: { PK: `PROJECT#${projectId}`, SK: 'DETAILS' },
      }))
      project = projectResult.Item
      if (!project || project.status !== 'ACTIVE') return errorResponse('Selected project is not active', 409)
    }

    const bookingDateSlot = `${bookingDate}#${startTime}-${endTime}`
    const existingBookingResult = await dynamoDB.send(
      new QueryCommand({
        TableName: TABLE_NAMES.BOOKINGS,
        IndexName: 'cab-slot-index',
        KeyConditionExpression: 'cabId = :cabId AND begins_with(bookingDateSlot, :bookingDate)',
        ExpressionAttributeValues: {
          ':cabId': cabId,
          ':bookingDate': `${bookingDate}#`,
        },
      })
    )

    const hasOverlap = (existingBookingResult.Items || []).some(existing => {
      if (existing.bookingStatus === 'CANCELLED' || existing.bookingStatus === 'COMPLETED') return false
      if (existing.startTime && existing.endTime) return intervalOverlaps({ startTime, endTime }, { startTime: existing.startTime, endTime: existing.endTime })
      return !existing.timeSlot || existing.timeSlot === timeSlot
    })
    if (hasOverlap) {
      return errorResponse('Sorry, this cab was just booked for an overlapping time. Please choose another cab or time.', 409)
    }

    const bookingId = randomUUID()
    const now = new Date().toISOString()
    const confirmationDeadline = new Date(Date.now() + 30 * 60 * 1000).toISOString()
    const driverResponseDeadline = confirmationDeadline  // 30-minute window from booking creation
    const lockPk = `CAB#${cabId}#${bookingDate}`
    const lockTimes = intervalLockTimes({ startTime, endTime })

    await dynamoDB.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            ConditionCheck: {
              TableName: TABLE_NAMES.CABS,
              Key: { PK: cabKey, SK: 'DETAILS' },
              ConditionExpression: '#status = :available',
              ExpressionAttributeNames: {
                '#status': 'status',
              },
              ExpressionAttributeValues: {
                ':available': 'AVAILABLE',
              },
            },
          },
          {
            Put: {
              TableName: TABLE_NAMES.BOOKINGS,
              Item: {
                PK: `BOOKING#${bookingId}`,
                SK: 'DETAILS',
                bookingId,
                cgmId: caller.userId,
                cgmName: caller.name,
                cgmMobile: caller.mobile || '',
                cabId,
                cabNumber: cab.cabNumber,
                driverId: 'UNASSIGNED',
                driverName: 'Pending Assignment',
                driverMobile: '',
                siteLocation,
                projectId: project?.projectId || projectId,
                projectName: project?.projectName || body.projectName,
                projectLocation: project?.location || body.projectLocation,
                pickupDetails: pickupDetails?.trim() || '',
                bookingDate,
                bookingDateSlot,
                timeSlot,
                startTime,
                endTime,
                bookingStatus: 'BOOKING_PENDING',
                status: 'BOOKING_PENDING',
                confirmationDeadline,
                driverResponseStatus: 'PENDING',
                driverResponseDeadline,
                statusUpdatedBy: 'CGM',
                statusUpdatedAt: now,
                createdAt: now,
                updatedAt: now,
              },
              ConditionExpression: 'attribute_not_exists(PK)',
            },
          },
          ...lockTimes.map(time => ({
            Put: {
              TableName: TABLE_NAMES.SLOTS,
              Item: { PK: lockPk, SK: `LOCK#${time}`, bookingId, createdAt: now },
              ConditionExpression: 'attribute_not_exists(PK)',
            },
          })),
        ],
      })
    )

    // Send a single notification to assigned driver if one exists
    try {
      const { createNotification } = await import('../../utils/notifications')
      if (cab.assignedDriverId) {
        await createNotification(cab.assignedDriverId, 'BOOKING_REQUEST', {
          bookingId,
          cabId,
          cabNumber: cab.cabNumber,
          bookingDate,
          startTime,
          endTime,
          confirmationDeadline,
          pickupDetails: pickupDetails?.trim() || '',
        })
      }
    } catch (err) {
      console.warn('Failed to create driver notification', err)
    }

    return successResponse({
      bookingId,
      cabId,
      bookingDate,
      timeSlot,
      siteLocation,
      status: 'BOOKING_PENDING',
      createdAt: now,
      confirmationDeadline,
    })
  } catch (error: any) {
    if (error?.name === 'TransactionCanceledException') {
      return errorResponse('Sorry, this cab was just booked for an overlapping time. Please choose another cab or time.', 409)
    }
    if (error?.name === 'ConditionalCheckFailedException') {
      return errorResponse('Sorry, this cab was just booked for an overlapping time. Please choose another cab or time.', 409)
    }
    console.error('createBooking failed', error)
    return Responses.serverError()
  }
}
