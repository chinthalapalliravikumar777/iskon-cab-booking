import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import { PutCommand } from '@aws-sdk/lib-dynamodb'
import { dynamoDB, TABLE_NAMES } from '../../utils/dynamodb'

/**
 * WebSocket $connect route.
 * Stores the connectionId + userId so we can push messages to specific users.
 *
 * The client must send the Cognito ID token as a query-string parameter:
 *   wss://api.example.com/ws?token=<idToken>
 *
 * API Gateway WebSocket APIs do NOT support the Cognito JWT authorizer directly,
 * so we read the query param and store it. The userId is extracted from the token
 * claims that API Gateway injects into requestContext when using a Lambda authorizer.
 * For simplicity we use the sub claim stored by our Lambda authorizer.
 */
export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const connectionId = event.requestContext.connectionId!
  const userId = (event.requestContext as any)?.authorizer?.userId ||
                 (event.requestContext as any)?.authorizer?.principalId ||
                 event.queryStringParameters?.userId || 'UNKNOWN'

  const ttl = Math.floor(Date.now() / 1000) + 24 * 60 * 60 // 24-hour TTL

  try {
    await dynamoDB.send(new PutCommand({
      TableName: TABLE_NAMES.CONNECTIONS,
      Item: {
        PK: `CONN#${connectionId}`,
        SK: 'META',
        connectionId,
        userId,
        connectedAt: new Date().toISOString(),
        ttl,
      },
    }))

    // Also index by userId so we can find all connections for a user
    await dynamoDB.send(new PutCommand({
      TableName: TABLE_NAMES.CONNECTIONS,
      Item: {
        PK: `USER#${userId}`,
        SK: `CONN#${connectionId}`,
        connectionId,
        userId,
        connectedAt: new Date().toISOString(),
        ttl,
      },
    }))

    return { statusCode: 200, body: 'Connected' }
  } catch (error) {
    console.error('WebSocket connect failed', error)
    return { statusCode: 500, body: 'Connection error' }
  }
}
