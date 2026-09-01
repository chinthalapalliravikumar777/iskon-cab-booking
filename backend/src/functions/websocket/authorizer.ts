import type { APIGatewayRequestAuthorizerEvent, APIGatewayAuthorizerResult } from 'aws-lambda'
import { CognitoJwtVerifier } from 'aws-jwt-verify'

/**
 * Lambda authorizer for the WebSocket API.
 * Validates the Cognito ID token passed as ?token= query param on connect.
 *
 * API Gateway WebSocket $connect passes query parameters to the authorizer.
 */

let verifier: ReturnType<typeof CognitoJwtVerifier.create> | null = null

function getVerifier() {
  if (!verifier) {
    verifier = CognitoJwtVerifier.create({
      userPoolId: process.env.COGNITO_USER_POOL_ID!,
      tokenUse: 'id',
      clientId: process.env.COGNITO_CLIENT_ID!,
    })
  }
  return verifier
}

export async function handler(event: APIGatewayRequestAuthorizerEvent): Promise<APIGatewayAuthorizerResult> {
  const token = event.queryStringParameters?.token

  if (!token) {
    return denyPolicy('UNKNOWN', event.methodArn)
  }

  try {
    const payload = await getVerifier().verify(token)
    const userId = payload.sub
    const role = (payload['custom:role'] as string) || ''

    return {
      principalId: userId,
      policyDocument: {
        Version: '2012-10-17',
        Statement: [
          {
            Action: 'execute-api:Invoke',
            Effect: 'Allow',
            Resource: event.methodArn,
          },
        ],
      },
      context: {
        userId,
        role,
        name: (payload['name'] as string) || '',
      },
    }
  } catch (err) {
    console.warn('WebSocket auth failed', err)
    return denyPolicy('UNKNOWN', event.methodArn)
  }
}

function denyPolicy(principalId: string, resource: string): APIGatewayAuthorizerResult {
  return {
    principalId,
    policyDocument: {
      Version: '2012-10-17',
      Statement: [{ Action: 'execute-api:Invoke', Effect: 'Deny', Resource: resource }],
    },
  }
}
