#!/usr/bin/env node
import 'source-map-support/register'
import * as cdk from 'aws-cdk-lib'
import { DatabaseStack } from '../lib/database-stack'
import { AuthStack } from '../lib/auth-stack'
import { ApiStack } from '../lib/api-stack'
import { HostingStack } from '../lib/hosting-stack'

const app = new cdk.App()

// All stacks deploy to ap-south-1 (Mumbai) under the iskon-dev AWS account
const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION || 'ap-south-1',
}

// Stack 1: DynamoDB tables
const dbStack = new DatabaseStack(app, 'IskonDatabaseStack', { env })

// Stack 2: Cognito user pools (depends on nothing)
const authStack = new AuthStack(app, 'IskonAuthStack', { env })

// Stack 3: Lambda functions + API Gateway (depends on DB and Auth)
const apiStack = new ApiStack(app, 'IskonApiStack', {
  env,
  usersTable: dbStack.usersTable,
  cabsTable: dbStack.cabsTable,
  bookingsTable: dbStack.bookingsTable,
  slotsTable: dbStack.slotsTable,
  userPool: authStack.userPool,
  userPoolClient: authStack.userPoolClient,
})

// Stack 4: S3 + CloudFront website hosting (depends on API)
new HostingStack(app, 'IskonHostingStack', {
  env,
  apiUrl: apiStack.apiUrl,
})
