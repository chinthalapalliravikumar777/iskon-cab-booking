import type { APIGatewayProxyResult } from 'aws-lambda'
import { ScanCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb'
import { dynamoDB, TABLE_NAMES } from '../../utils/dynamodb'
import { intervalLockTimes } from '../../utils/bookingTime'

/**
 * Scheduled Lambda to expire pending bookings whose confirmationDeadline has passed.
 * Runs frequently (e.g., every 1 minute) via EventBridge.
 */
export async function handler(): Promise<APIGatewayProxyResult | void> {
  try {
    const now = new Date().toISOString()

    // Scan for pending bookings whose deadline <= now. For production with many items,
    // add a GSI to query by status and confirmationDeadline instead of scanning.
    const result = await dynamoDB.send(new ScanCommand({
      TableName: TABLE_NAMES.BOOKINGS,
      // Check both field names for backward compatibility
      FilterExpression: '(#status = :pending OR bookingStatus = :pending) AND confirmationDeadline <= :now',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: { ':pending': 'BOOKING_PENDING', ':now': now },
      ProjectionExpression: 'PK, SK, bookingId, cgmId, cabId, cabNumber, bookingDate, startTime, endTime',
    }))

    const items = result.Items || []
    for (const booking of items) {
      try {
        const bookingId = booking.bookingId
        const lockPk = `CAB#${booking.cabId}#${booking.bookingDate}`
        const lockTimes = intervalLockTimes({ startTime: booking.startTime, endTime: booking.endTime })

        const transactItems: any[] = []
        transactItems.push({
          Update: {
            TableName: TABLE_NAMES.BOOKINGS,
            Key: { PK: `BOOKING#${bookingId}`, SK: 'DETAILS' },
            UpdateExpression: 'SET #status = :expired, expiredAt = :now, updatedAt = :now',
            ConditionExpression: '#status = :pending AND confirmationDeadline <= :now',
            ExpressionAttributeNames: { '#status': 'status' },
            ExpressionAttributeValues: { ':expired': 'EXPIRED', ':pending': 'BOOKING_PENDING', ':now': now },
          },
        })

        for (const t of lockTimes) {
          transactItems.push({
            Delete: {
              TableName: TABLE_NAMES.SLOTS,
              Key: { PK: lockPk, SK: `LOCK#${t}` },
            },
          })
        }

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
