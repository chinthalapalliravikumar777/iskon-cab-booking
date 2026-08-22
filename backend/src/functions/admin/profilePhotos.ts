import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { requireRole } from '../../utils/auth'
import { errorResponse, Responses, successResponse } from '../../utils/response'

const s3Client = new S3Client({})
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const userId = event.pathParameters?.userId
  if (!userId || !/^[A-Za-z0-9-]+$/.test(userId)) return errorResponse('A valid user ID is required.')
  const method = (event as any).requestContext?.http?.method || event.httpMethod || 'GET'
  const caller = requireRole(event, method === 'PUT' ? ['ADMIN'] : ['ADMIN', 'CGM', 'DRIVER'])
  if (!caller) return Responses.unauthorized()

  const bucket = process.env.PROFILE_PHOTOS_BUCKET
  if (!bucket) return Responses.serverError()
  const key = `profiles/${userId}/photo`

  try {
    if (method === 'PUT') {
      const contentType = event.headers?.['content-type'] || event.headers?.['Content-Type'] || ''
      const contentLength = Number(event.headers?.['content-length'] || event.headers?.['Content-Length'] || 0)
      if (!ALLOWED_TYPES.has(contentType)) return errorResponse('Only JPEG, PNG, and WebP images are allowed.')
      if (contentLength > 5 * 1024 * 1024) return errorResponse('Profile photos must be 5 MB or smaller.')
      const uploadUrl = await getSignedUrl(s3Client, new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType }), { expiresIn: 600 })
      return successResponse({ uploadUrl, photoKey: key, expiresIn: 600 })
    }

    const viewUrl = await getSignedUrl(s3Client, new GetObjectCommand({ Bucket: bucket, Key: key }), { expiresIn: 900 })
    return successResponse({ viewUrl, expiresIn: 900 })
  } catch (error: any) {
    if (method === 'GET' && error?.name === 'NoSuchKey') return errorResponse('Profile photo not found.', 404)
    console.error('profile photo operation failed', error)
    return Responses.serverError()
  }
}