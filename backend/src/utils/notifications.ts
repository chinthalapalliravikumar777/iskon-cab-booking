import { PutCommand } from '@aws-sdk/lib-dynamodb'
import { dynamoDB, TABLE_NAMES } from './dynamodb'

/**
 * Creates a notification record in DynamoDB and optionally pushes it
 * via WebSocket to the user's active connection (if any).
 *
 * IMPORTANT: Notification failures must NEVER break the calling operation.
 * Always wrap calls to createNotification in try/catch.
 */
export async function createNotification(
  userId: string,
  type: string,
  payload: Record<string, unknown>
): Promise<void> {
  const now = new Date().toISOString()
  const notificationId = `${now}#${Math.random().toString(36).slice(2, 10)}`
  const sk = `NOTIF#${notificationId}`

  const item = {
    PK: `NOTIF#${userId}`,
    SK: sk,
    notificationId: sk,
    userId,
    type,
    payload,
    sentAt: now,
    readAt: null,
  }

  // Write to DynamoDB — this is the source of truth
  await dynamoDB.send(new PutCommand({ TableName: TABLE_NAMES.NOTIFICATIONS, Item: item }))

  // Fire-and-forget WebSocket push — never awaited at the top level
  // so a WS failure never prevents the notification from being saved
  pushWs(userId, type, { ...payload, notificationId: sk, sentAt: now }).catch(err => {
    console.warn('WebSocket push failed (non-critical)', err)
  })
}

async function pushWs(userId: string, type: string, payload: Record<string, unknown>): Promise<void> {
  try {
    const { pushToUser } = await import('../functions/websocket/broadcast')
    await pushToUser(userId, type, payload)
  } catch (err) {
    // Silently swallow — WS module not loaded yet or endpoint not configured
  }
}

export default createNotification
