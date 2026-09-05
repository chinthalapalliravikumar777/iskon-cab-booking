import type { APIGatewayProxyResult } from 'aws-lambda'
import { ScanCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb'
import { dynamoDB, TABLE_NAMES } from '../../utils/dynamodb'

/**
 * Scheduled Lambda to expire driver response windows whose deadline has passed.
 * Runs frequently (e.g., every 1 minute) via EventBridge.
 */
export async function handler(): Promise<APIGatewayProxyResult | void> {
  try {
    const now = new Date().toISOString()

    // Scan for pending driver responses whose deadline <= now. For production with many items,
    // add a GSI to query by response status and deadline instead of scanning.
    const items: Record<string, any>[] = []
    let lastEvaluatedKey: Record<string, unknown> | undefined
    do {
      const result = await dynamoDB.send(new ScanCommand({
        TableName: TABLE_NAMES.BOOKINGS,
        FilterExpression: 'driverResponseStatus = :pending AND driverResponseDeadline <= :now',
        ExpressionAttributeValues: { ':pending': 'PENDING', ':now': now },
        ProjectionExpression: 'PK, SK, bookingId, cgmId, cabId, cabNumber, bookingDate, startTime, endTime, driverResponseStatus, driverResponseDeadline',
        ExclusiveStartKey: lastEvaluatedKey,
      }))
      items.push(...((result.Items || []) as Record<string, any>[]))
      lastEvaluatedKey = result.LastEvaluatedKey
    } while (lastEvaluatedKey)
    for (const booking of items) {
      try {
        const bookingId = booking.bookingId
        const transactItems: any[] = []
        transactItems.push({
          Update: {
            TableName: TABLE_NAMES.BOOKINGS,
            Key: { PK: `BOOKING#${bookingId}`, SK: 'DETAILS' },
            UpdateExpression: 'SET driverResponseStatus = :expired, statusUpdatedBy = :system, statusUpdatedAt = :now, updatedAt = :now',
            ConditionExpression: 'driverResponseStatus = :pending AND driverResponseDeadline <= :now AND (bookingStatus = :bookingPending OR #status = :bookingPending)',
            ExpressionAttributeNames: { '#status': 'status' },
            ExpressionAttributeValues: { ':expired': 'EXPIRED', ':pending': 'PENDING', ':bookingPending': 'BOOKING_PENDING', ':system': 'SYSTEM', ':now': now },
          },
        })

        await dynamoDB.send(new TransactWriteCommand({ TransactItems: transactItems }))
        try {
          const { createNotification } = await import('../../utils/notifications')
          await createNotification(booking.cgmId, 'BOOKING_EXPIRED', {
            bookingId: booking.bookingId,
            cabId: booking.cabId,
            cabNumber: booking.cabNumber,
            bookingDate: booking.bookingDate,
            startTime: booking.startTime,
            endTime: booking.endTime,
            expiredAt: now,
          })
        } catch (err) {
          console.warn('Failed to create expiration notification', err)
        }
      } catch (err: any) {
        // If conditional update failed, skip (likely already processed)
        console.warn('Failed to expire booking', booking.bookingId, err.name || err)
      }
    }
  } catch (error) {
    console.error('expireBookings failed', error)
  }
}

export default handler
