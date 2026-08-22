import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import { UpdateCommand } from '@aws-sdk/lib-dynamodb'
import { requireRole } from '../../utils/auth'
import { dynamoDB, TABLE_NAMES } from '../../utils/dynamodb'
import { errorResponse, successResponse, Responses } from '../../utils/response'

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const caller = requireRole(event, ['ADMIN'])
  if (!caller) return Responses.unauthorized()

  const cabId = event.pathParameters?.cabId
  if (!cabId) return errorResponse('cabId is required')

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

  try {
    await dynamoDB.send(
      new UpdateCommand({
        TableName: TABLE_NAMES.CABS,
        Key: { PK: `CAB#${cabId}`, SK: 'DETAILS' },
        UpdateExpression: 'SET #status = :status, updatedAt = :updatedAt REMOVE assignedDriverId, assignedDriverName',
        ExpressionAttributeNames: {
          '#status': 'status',
        },
        ExpressionAttributeValues: {
          ':status': newStatus,
          ':updatedAt': new Date().toISOString(),
        },
      })
    )

    return successResponse({ cabId, status: newStatus })
  } catch (error) {
    console.error('releaseCab failed', error)
    return Responses.serverError()
  }
}
