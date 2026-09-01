import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import { DeleteCommand, QueryCommand } from '@aws-sdk/lib-dynamodb'
import { dynamoDB, TABLE_NAMES } from '../../utils/dynamodb'

/**
 * WebSocket $disconnect route.
 * Removes the connection records from the connections table.
 */
export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const connectionId = event.requestContext.connectionId!

  try {
    // Get the connection to find the userId
    const result = await dynamoDB.send(new QueryCommand({
      TableName: TABLE_NAMES.CONNECTIONS,
      KeyConditionExpression: 'PK = :pk AND SK = :sk',
      ExpressionAttributeValues: {
        ':pk': `CONN#${connectionId}`,
        ':sk': 'META',
      },
    }))

    const connection = result.Items?.[0]
    if (connection?.userId) {
      // Delete the user->connection index record
      await dynamoDB.send(new DeleteCommand({
        TableName: TABLE_NAMES.CONNECTIONS,
        Key: {
          PK: `USER#${connection.userId}`,
          SK: `CONN#${connectionId}`,
        },
      }))
    }

    // Delete the connection record
    await dynamoDB.send(new DeleteCommand({
      TableName: TABLE_NAMES.CONNECTIONS,
      Key: { PK: `CONN#${connectionId}`, SK: 'META' },
    }))

    return { statusCode: 200, body: 'Disconnected' }
  } catch (error) {
    console.error('WebSocket disconnect failed', error)
    return { statusCode: 500, body: 'Disconnect error' }
  }
}
