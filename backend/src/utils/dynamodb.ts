import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb'

/**
 * Create a single DynamoDB Document client for all Lambda functions.
 * DynamoDBDocumentClient simplifies working with DynamoDB by automatically
 * marshalling/unmarshalling JavaScript objects to/from DynamoDB format.
 */
const client = new DynamoDBClient({
  region: process.env.AWS_REGION || 'ap-south-1',
})

export const dynamoDB = DynamoDBDocumentClient.from(client, {
  marshallOptions: {
    // Remove undefined values from objects before writing to DynamoDB
    removeUndefinedValues: true,
  },
})

// Table name constants - pulled from environment variables set by CDK
export const TABLE_NAMES = {
  USERS: process.env.USERS_TABLE || 'iskon-users',
  CABS: process.env.CABS_TABLE || 'iskon-cabs',
  BOOKINGS: process.env.BOOKINGS_TABLE || 'iskon-bookings',
  SLOTS: process.env.SLOTS_TABLE || 'iskon-slots',
  PROJECTS: process.env.PROJECTS_TABLE || 'iskon-projects',
  NOTIFICATIONS: process.env.NOTIFICATIONS_TABLE || 'iskon-notifications',
  CONNECTIONS: process.env.CONNECTIONS_TABLE || 'iskon-connections',
} as const
