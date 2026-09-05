import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import { ScanCommand, QueryCommand } from '@aws-sdk/lib-dynamodb'
import { requireRole } from '../../utils/auth'
import { dynamoDB, TABLE_NAMES } from '../../utils/dynamodb'
import { errorResponse, successResponse, Responses } from '../../utils/response'

/**
 * GET /cgm/cabs/available?date=YYYY-MM-DD&slot=HH:MM-HH:MM
 *
 * Returns available or assigned cabs that are not yet booked for the requested date+slot.
 * Only accessible by CGM role.
 */
export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const caller = requireRole(event, ['CGM'])
  if (!caller) return Responses.unauthorized()

  const { date, slot } = event.queryStringParameters || {}
  if (!date || !slot) {
    return errorResponse('Query parameters "date" and "slot" are required')
  }

  try {
    const cabsResult = await dynamoDB.send(
      new ScanCommand({
        TableName: TABLE_NAMES.CABS,
        FilterExpression: '#status IN (:available, :assigned)',
        ExpressionAttributeNames: {
          '#status': 'status',
        },
        ExpressionAttributeValues: {
          ':available': 'AVAILABLE',
          ':assigned': 'ASSIGNED',
        },
      })
    )

    const availableCabs = cabsResult.Items || []
    const results: Array<Record<string, unknown>> = []

    for (const cab of availableCabs) {
      const bookingKeyPrefix = `${date}#${slot}`
      const bookingResult = await dynamoDB.send(
        new QueryCommand({
          TableName: TABLE_NAMES.BOOKINGS,
          IndexName: 'cab-slot-index',
          KeyConditionExpression: 'cabId = :cabId AND begins_with(bookingDateSlot, :prefix)',
          ExpressionAttributeValues: {
            ':cabId': cab.cabId,
            ':prefix': bookingKeyPrefix,
          },
        })
      )

      if (!bookingResult.Items || bookingResult.Items.length === 0) {
        results.push({
          cabId: cab.cabId,
          cabNumber: cab.cabNumber,
          vehicleModel: cab.vehicleModel,
          registrationNumber: cab.registrationNumber,
          assignedDriverId: cab.assignedDriverId,
          assignedDriverName: cab.assignedDriverName,
          status: cab.status,
          updatedAt: cab.updatedAt,
        })
      }
    }

    return successResponse(results)
  } catch (error) {
    console.error('getAvailableCabs failed', error)
    return Responses.serverError()
  }
}
