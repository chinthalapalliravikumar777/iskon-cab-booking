import { randomUUID } from 'crypto'
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import { GetCommand, PutCommand, ScanCommand, UpdateCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb'
import { requireRole } from '../../utils/auth'
import { dynamoDB, TABLE_NAMES } from '../../utils/dynamodb'
import { errorResponse, Responses, successResponse } from '../../utils/response'

const CAB_STATUSES = ['AVAILABLE', 'RESERVED', 'ASSIGNED', 'ON_TRIP', 'MAINTENANCE', 'INACTIVE']

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const method = (event as any).requestContext?.http?.method || event.httpMethod || 'GET'
  const caller = requireRole(event, ['ADMIN'])
  if (!caller) return Responses.unauthorized()

  if (method === 'GET') {
    try {
      const result = await dynamoDB.send(new ScanCommand({ TableName: TABLE_NAMES.CABS }))
      return successResponse(result.Items || [])
    } catch (error) {
      console.error('listCabs failed', error)
      return Responses.serverError()
    }
  }

  let body: { cabNumber?: string; vehicleModel?: string; registrationNumber?: string; vehicleDetails?: string; status?: string; assignedDriverId?: string; assignedDriverName?: string; assignedDriverMobile?: string }
  try { body = JSON.parse(event.body || '{}') } catch { return errorResponse('Invalid request body') }
  const cabId = event.pathParameters?.cabId

  if (method === 'POST') {
    if (!body.cabNumber?.trim() || !body.vehicleModel?.trim() || !body.registrationNumber?.trim()) return errorResponse('Cab number, vehicle model, and registration number are required')
    const newCabId = randomUUID()
    const now = new Date().toISOString()
    const cab = { PK: `CAB#${newCabId}`, SK: 'DETAILS', cabId: newCabId, cabNumber: body.cabNumber.trim(), vehicleModel: body.vehicleModel.trim(), registrationNumber: body.registrationNumber.trim(), vehicleDetails: body.vehicleDetails?.trim() || '', status: body.status || 'AVAILABLE', assignedDriverId: body.assignedDriverId, assignedDriverName: body.assignedDriverName, assignedDriverMobile: body.assignedDriverMobile, updatedAt: now }
    if (!CAB_STATUSES.includes(cab.status)) return errorResponse(`Status must be one of: ${CAB_STATUSES.join(', ')}`)
    try {
      await ensureDriverAvailable(body.assignedDriverId, newCabId)
      await dynamoDB.send(new PutCommand({ TableName: TABLE_NAMES.CABS, Item: cab, ConditionExpression: 'attribute_not_exists(PK)' }))
      return successResponse(cab, 201)
    } catch (error: any) {
      if (error?.code === 'DRIVER_ASSIGNED') return errorResponse(error.message, 409)
      console.error('createCab failed', error)
      return Responses.serverError()
    }
  }

  if (method !== 'PATCH' || !cabId) return errorResponse('Cab ID is required')
  if (body.status && !CAB_STATUSES.includes(body.status)) return errorResponse(`Status must be one of: ${CAB_STATUSES.join(', ')}`)

  try {
    const currentResult = await dynamoDB.send(new GetCommand({ TableName: TABLE_NAMES.CABS, Key: { PK: `CAB#${cabId}`, SK: 'DETAILS' } }))
    const currentCab = currentResult.Item
    if (!currentCab) return errorResponse('Cab not found', 404)

    // Check if driver is available (not already assigned to another active cab)
    await ensureDriverAvailable(body.assignedDriverId, cabId)

    const now = new Date().toISOString()
    const oldDriverId = currentCab.assignedDriverId
    const newDriverId = body.assignedDriverId
    const newCabNumber = body.cabNumber || currentCab.cabNumber

    // Build update expression for cab
    const names: Record<string, string> = {}
    const values: Record<string, unknown> = { ':updatedAt': now }
    const updates = ['updatedAt = :updatedAt']
    const fields = ['cabNumber', 'vehicleModel', 'registrationNumber', 'vehicleDetails', 'status', 'assignedDriverId', 'assignedDriverName', 'assignedDriverMobile'] as const
    for (const field of fields) {
      if (body[field] !== undefined) { updates.push(`#${field} = :${field}`); names[`#${field}`] = field; values[`:${field}`] = body[field] || null }
    }

    // If assigning a driver, use transaction to update both cab and driver records
    if (newDriverId && newDriverId !== oldDriverId) {
      const transactItems: any[] = [
        {
          Update: {
            TableName: TABLE_NAMES.CABS,
            Key: { PK: `CAB#${cabId}`, SK: 'DETAILS' },
            UpdateExpression: `SET ${updates.join(', ')}`,
            ExpressionAttributeNames: names,
            ExpressionAttributeValues: values,
          },
        },
        {
          Update: {
            TableName: TABLE_NAMES.USERS,
            Key: { PK: `USER#${newDriverId}`, SK: 'PROFILE' },
            UpdateExpression: 'SET assignedCabId = :cabId, assignedCabNumber = :cabNumber, updatedAt = :updatedAt',
            ExpressionAttributeValues: {
              ':cabId': cabId,
              ':cabNumber': newCabNumber,
              ':updatedAt': now,
            },
          },
        },
      ]

      // If there was an old driver assignment, clear it
      if (oldDriverId && oldDriverId !== 'UNASSIGNED') {
        transactItems.push({
          Update: {
            TableName: TABLE_NAMES.USERS,
            Key: { PK: `USER#${oldDriverId}`, SK: 'PROFILE' },
            UpdateExpression: 'REMOVE assignedCabId, assignedCabNumber SET updatedAt = :updatedAt',
            ExpressionAttributeValues: { ':updatedAt': now },
          },
        })
      }

      await dynamoDB.send(new TransactWriteCommand({ TransactItems: transactItems }))
    } else if (!newDriverId && oldDriverId && oldDriverId !== 'UNASSIGNED') {
      // Unassigning — clear from both cab and driver
      const transactItems: any[] = [
        {
          Update: {
            TableName: TABLE_NAMES.CABS,
            Key: { PK: `CAB#${cabId}`, SK: 'DETAILS' },
            UpdateExpression: `SET ${updates.join(', ')}`,
            ExpressionAttributeNames: names,
            ExpressionAttributeValues: values,
          },
        },
        {
          Update: {
            TableName: TABLE_NAMES.USERS,
            Key: { PK: `USER#${oldDriverId}`, SK: 'PROFILE' },
            UpdateExpression: 'REMOVE assignedCabId, assignedCabNumber SET updatedAt = :updatedAt',
            ExpressionAttributeValues: { ':updatedAt': now },
          },
        },
      ]
      await dynamoDB.send(new TransactWriteCommand({ TransactItems: transactItems }))
    } else {
      // No driver assignment change, just update cab
      const result = await dynamoDB.send(new UpdateCommand({ TableName: TABLE_NAMES.CABS, Key: { PK: `CAB#${cabId}`, SK: 'DETAILS' }, UpdateExpression: `SET ${updates.join(', ')}`, ExpressionAttributeNames: names, ExpressionAttributeValues: values, ReturnValues: 'ALL_NEW' }))
      return successResponse(result.Attributes)
    }

    // Return updated cab
    const updatedResult = await dynamoDB.send(new GetCommand({ TableName: TABLE_NAMES.CABS, Key: { PK: `CAB#${cabId}`, SK: 'DETAILS' } }))
    return successResponse(updatedResult.Item)
  } catch (error: any) {
    if (error?.code === 'DRIVER_ASSIGNED') return errorResponse(error.message, 409)
    console.error('updateCab failed', error)
    return Responses.serverError()
  }
}

async function ensureDriverAvailable(driverId: string | undefined, cabId: string): Promise<void> {
  if (!driverId) return
  const result = await dynamoDB.send(new ScanCommand({ TableName: TABLE_NAMES.CABS, FilterExpression: 'assignedDriverId = :driverId AND PK <> :cabKey AND #status <> :inactive', ExpressionAttributeNames: { '#status': 'status' }, ExpressionAttributeValues: { ':driverId': driverId, ':cabKey': `CAB#${cabId}`, ':inactive': 'INACTIVE' } }))
  if ((result.Items || []).length > 0) {
    const error: any = new Error('This driver is already assigned to another active cab.')
    error.code = 'DRIVER_ASSIGNED'
    throw error
  }
}