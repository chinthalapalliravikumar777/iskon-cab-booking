import { ApiGatewayManagementApiClient, PostToConnectionCommand, GoneException } from '@aws-sdk/client-apigatewaymanagementapi'
import { QueryCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb'
import { dynamoDB, TABLE_NAMES } from '../../utils/dynamodb'

/**
 * Sends a WebSocket push message to all active connections for a given userId.
 * Call this from any Lambda after creating a notification (notifications.ts already
 * writes to DynamoDB; this pushes the same payload instantly over WebSocket).
 *
 * Non-blocking: if the user has no open WebSocket connections, it's a no-op.
 * If a connection is stale (GoneException), it's cleaned up automatically.
 */
export async function pushToUser(
  userId: string,
  type: string,
  payload: Record<string, unknown>
): Promise<void> {
  const wsEndpoint = process.env.WEBSOCKET_ENDPOINT
  if (!wsEndpoint) {
    // WebSocket not configured — graceful no-op
    return
  }

  try {
    const result = await dynamoDB.send(new QueryCommand({
      TableName: TABLE_NAMES.CONNECTIONS,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
      ExpressionAttributeValues: {
        ':pk': `USER#${userId}`,
        ':prefix': 'CONN#',
      },
    }))

    const connections = result.Items || []
    if (connections.length === 0) return

    const client = new ApiGatewayManagementApiClient({ endpoint: wsEndpoint })
    const message = JSON.stringify({ type, payload, timestamp: new Date().toISOString() })

    await Promise.allSettled(
      connections.map(async conn => {
        try {
          await client.send(new PostToConnectionCommand({
            ConnectionId: conn.connectionId,
            Data: Buffer.from(message),
          }))
        } catch (err: any) {
          if (err instanceof GoneException || err?.name === 'GoneException' || err?.$metadata?.httpStatusCode === 410) {
            // Connection is stale — clean up
            await dynamoDB.send(new DeleteCommand({
              TableName: TABLE_NAMES.CONNECTIONS,
              Key: { PK: `CONN#${conn.connectionId}`, SK: 'META' },
            })).catch(() => {})
            await dynamoDB.send(new DeleteCommand({
              TableName: TABLE_NAMES.CONNECTIONS,
              Key: { PK: `USER#${userId}`, SK: `CONN#${conn.connectionId}` },
            })).catch(() => {})
          } else {
            console.warn(`Failed to push to connection ${conn.connectionId}`, err)
          }
        }
      })
    )
  } catch (error) {
    console.warn('pushToUser failed (non-critical)', error)
  }
}
