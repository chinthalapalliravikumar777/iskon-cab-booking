import { randomUUID } from 'crypto'
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import { GetCommand, PutCommand, ScanCommand, UpdateCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb'
import { requireRole } from '../../utils/auth'
import { dynamoDB, TABLE_NAMES } from '../../utils/dynamodb'
import { errorResponse, successResponse, Responses } from '../../utils/response'

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const method = (event as any).requestContext?.http?.method || event.httpMethod || 'GET'
  const caller = requireRole(event, method === 'GET' ? ['ADMIN', 'CGM'] : ['ADMIN'])
  if (!caller) return Responses.unauthorized()

  if (method === 'GET') {
    try {
      const result = await dynamoDB.send(new ScanCommand({ TableName: TABLE_NAMES.PROJECTS }))
      const projects = (result.Items || []).filter(project => caller.role === 'ADMIN' || project.status === 'ACTIVE')
      return successResponse(projects)
    } catch (error) {
      console.error('listProjects failed', error)
      return Responses.serverError()
    }
  }

  let body: { projectName?: string; location?: string; status?: 'ACTIVE' | 'INACTIVE'; description?: string }
  try { body = JSON.parse(event.body || '{}') } catch { return errorResponse('Invalid request body') }

  const projectId = event.pathParameters?.projectId
  const projectName = body.projectName?.trim()
  const location = body.location?.trim()
  const status = body.status || 'ACTIVE'
  if (method === 'POST' && (!projectName || !location)) return errorResponse('Project name and location are required')
  if (method === 'PATCH' && (!projectId || (!projectName && !location && !body.status && body.description === undefined))) return errorResponse('Project changes are required')
  if (method === 'DELETE' && !projectId) return errorResponse('Project ID is required')
  if (!['ACTIVE', 'INACTIVE'].includes(status)) return errorResponse('Status must be ACTIVE or INACTIVE')

  try {
    if (method === 'POST') {
      const now = new Date().toISOString()
      const newProjectId = randomUUID()
      const created = { PK: `PROJECT#${newProjectId}`, SK: 'DETAILS', projectId: newProjectId, projectName, location, status, description: body.description?.trim(), createdAt: now, updatedAt: now }
      await dynamoDB.send(new PutCommand({ TableName: TABLE_NAMES.PROJECTS, Item: created, ConditionExpression: 'attribute_not_exists(PK)' }))
      return successResponse(created, 201)
    }

    if (method === 'DELETE') {
      const existing = await dynamoDB.send(new GetCommand({ TableName: TABLE_NAMES.PROJECTS, Key: { PK: `PROJECT#${projectId}`, SK: 'DETAILS' } }))
      if (!existing.Item) return errorResponse('Project not found', 404)

      const bookingReferences = await dynamoDB.send(new ScanCommand({
        TableName: TABLE_NAMES.BOOKINGS,
        FilterExpression: 'projectId = :projectId',
        ExpressionAttributeValues: { ':projectId': projectId },
        ProjectionExpression: 'bookingId',
      }))
      if ((bookingReferences.Items || []).length > 0) {
        return errorResponse('This project cannot be deleted because it is referenced by booking history. Deactivate it instead.', 409)
      }

      await dynamoDB.send(new DeleteCommand({ TableName: TABLE_NAMES.PROJECTS, Key: { PK: `PROJECT#${projectId}`, SK: 'DETAILS' } }))
      return successResponse({ projectId, deleted: true })
    }

    const existing = await dynamoDB.send(new GetCommand({ TableName: TABLE_NAMES.PROJECTS, Key: { PK: `PROJECT#${projectId}`, SK: 'DETAILS' } }))
    if (!existing.Item) return errorResponse('Project not found', 404)
    const now = new Date().toISOString()
    const updateParts = ['updatedAt = :updatedAt']
    const values: Record<string, unknown> = { ':updatedAt': now }
    if (projectName) { updateParts.push('projectName = :projectName'); values[':projectName'] = projectName }
    if (location) { updateParts.push('#location = :location'); values[':location'] = location }
    if (body.status) { updateParts.push('#status = :status'); values[':status'] = body.status }
    if (body.description !== undefined) { updateParts.push('description = :description'); values[':description'] = body.description.trim() }
    const updated = await dynamoDB.send(new UpdateCommand({ TableName: TABLE_NAMES.PROJECTS, Key: { PK: `PROJECT#${projectId}`, SK: 'DETAILS' }, UpdateExpression: `SET ${updateParts.join(', ')}`, ExpressionAttributeNames: { ...(location ? { '#location': 'location' } : {}), ...(body.status ? { '#status': 'status' } : {}) }, ExpressionAttributeValues: values, ReturnValues: 'ALL_NEW' }))
    return successResponse(updated.Attributes)
  } catch (error) {
    console.error('project operation failed', error)
    return Responses.serverError()
  }
}