import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb'
import { dynamoDB, TABLE_NAMES } from './dynamodb'
import { cert, getApps, initializeApp, type App } from 'firebase-admin/app'
import { getMessaging } from 'firebase-admin/messaging'

let firebaseApp: App | null = null

function getFirebaseApp(): App | null {
  const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
  if (!serviceAccount) return null
  if (!firebaseApp) {
    try {
      firebaseApp = getApps()[0] || initializeApp({ credential: cert(JSON.parse(serviceAccount)) })
    } catch (error) {
      console.warn('FCM is not configured correctly', error)
      return null
    }
  }
  return firebaseApp
}

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
  sendFcmPush(userId, type, payload).catch(err => {
    console.warn('FCM push failed (non-critical)', err)
  })
}

export async function sendFcmPush(userId: string, type: string, payload: Record<string, unknown>): Promise<void> {
  const app = getFirebaseApp()
  if (!app) return

  const userResult = await dynamoDB.send(new GetCommand({
    TableName: TABLE_NAMES.USERS,
    Key: { PK: `USER#${userId}`, SK: 'PROFILE' },
  }))
  const tokens = Array.from(userResult.Item?.pushTokens || []) as string[]
  if (tokens.length === 0) return

  const contactName = String(payload.cgmName || payload.driverName || '')
  const title = type === 'BOOKING_REQUEST'
    ? 'New cab booking request'
    : type === 'BOOKING_CONFIRMED'
      ? 'Cab booking confirmed'
      : 'ISKON Cab Booking'
  const body = type === 'BOOKING_REQUEST'
    ? `${contactName || 'A CGM'} booked ${payload.cabNumber || 'a cab'}. Please respond.`
    : type === 'BOOKING_CONFIRMED'
      ? `Driver ${contactName || ''} accepted your cab booking.`
      : String(payload.message || type)
  const data = Object.fromEntries(Object.entries({ type, ...payload }).map(([key, value]) => [key, String(value ?? '')]))

  await Promise.allSettled(tokens.map(token => getMessaging(app).send({
    token,
    notification: { title, body },
    data,
    android: { notification: { sound: 'default' } },
    apns: { payload: { aps: { sound: 'default' } } },
    webpush: { notification: { title, body, icon: '/favicon.svg' } },
  })))
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
