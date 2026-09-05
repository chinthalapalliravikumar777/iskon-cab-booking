import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import { GetCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb'
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
    const current = await dynamoDB.send(new GetCommand({
      TableName: TABLE_NAMES.CABS,
      Key: { PK: `CAB#${cabId}`, SK: 'DETAILS' },
    }))
    if (!current.Item) return errorResponse('Cab not found', 404)

    const now = new Date().toISOString()
    const transactItems: any[] = [{
      Update: {
        TableName: TABLE_NAMES.CABS,
        Key: { PK: `CAB#${cabId}`, SK: 'DETAILS' },
        UpdateExpression: 'SET #status = :status, updatedAt = :updatedAt REMOVE assignedDriverId, assignedDriverName',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: { ':status': newStatus, ':updatedAt': now },
      },
    }]
    if (current.Item.assignedDriverId && current.Item.assignedDriverId !== 'UNASSIGNED') {
      transactItems.push({
        Update: {
          TableName: TABLE_NAMES.USERS,
          Key: { PK: `USER#${current.Item.assignedDriverId}`, SK: 'PROFILE' },
          UpdateExpression: 'REMOVE assignedCabId, assignedCabNumber SET updatedAt = :updatedAt',
          ExpressionAttributeValues: { ':updatedAt': now },
        },
      })
    }
    await dynamoDB.send(new TransactWriteCommand({ TransactItems: transactItems }))

    return successResponse({ cabId, status: newStatus })
  } catch (error) {
    console.error('releaseCab failed', error)
    return Responses.serverError()
  }
}
