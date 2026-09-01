import { ScanCommand, UpdateCommand, BatchWriteCommand } from '@aws-sdk/lib-dynamodb'
import { dynamoDB, TABLE_NAMES } from '../../utils/dynamodb'

/**
 * Scheduled Lambda: runs every 1 minute via EventBridge
 * Marks all bookings with driverResponseStatus = PENDING and past driverResponseDeadline as EXPIRED
 */
export async function handler(): Promise<void> {
  const now = new Date()
  const nowIso = now.toISOString()

  try {
    // Find all PENDING bookings
    const scanParams = {
      TableName: TABLE_NAMES.BOOKINGS,
      FilterExpression: 'driverResponseStatus = :pending AND driverResponseDeadline < :now',
      ExpressionAttributeValues: {
        ':pending': 'PENDING',
        ':now': nowIso,
      },
      ProjectionExpression: 'PK,SK,bookingId,driverResponseDeadline,bookingStatus,cgmId',
    }

    const result = await dynamoDB.send(new ScanCommand(scanParams))
    const expiredBookings = result.Items || []

    if (expiredBookings.length === 0) {
      console.log('No expired bookings to mark')
      return
    }

    console.log(`Found ${expiredBookings.length} expired bookings to mark`)

    // Batch update all expired bookings
    const items: any[] = []
    for (const booking of expiredBookings) {
      items.push({
        Update: {
          TableName: TABLE_NAMES.BOOKINGS,
          Key: { PK: booking.PK, SK: booking.SK },
          UpdateExpression: 'SET driverResponseStatus = :expired, statusUpdatedBy = :system, statusUpdatedAt = :now, updatedAt = :now',
          ExpressionAttributeValues: {
            ':expired': 'EXPIRED',
            ':system': 'SYSTEM',
            ':now': nowIso,
          },
        },
      })
    }

    // Process in batches of 25 (DynamoDB limit)
    for (let i = 0; i < items.length; i += 25) {
      const batch = items.slice(i, i + 25)
      await dynamoDB.send(
        new BatchWriteCommand({
          RequestItems: {
            [TABLE_NAMES.BOOKINGS]: batch,
          },
        })
      )
      console.log(`Marked ${Math.min(25, items.length - i)} bookings as expired`)
    }

    console.log(`Successfully marked ${items.length} bookings as expired`)
  } catch (error) {
    console.error('Failed to mark expired bookings', error)
    throw error
  }
}

export default handler
