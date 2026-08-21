import * as cdk from 'aws-cdk-lib'
import * as lambda from 'aws-cdk-lib/aws-lambda'
import * as apigateway from 'aws-cdk-lib/aws-apigatewayv2'
import * as apigatewayIntegrations from 'aws-cdk-lib/aws-apigatewayv2-integrations'
import * as apigatewayAuthorizers from 'aws-cdk-lib/aws-apigatewayv2-authorizers'
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb'
import * as cognito from 'aws-cdk-lib/aws-cognito'
import * as logs from 'aws-cdk-lib/aws-logs'
import { Construct } from 'constructs'
import * as path from 'path'

interface ApiStackProps extends cdk.StackProps {
  usersTable: dynamodb.Table
  cabsTable: dynamodb.Table
  bookingsTable: dynamodb.Table
  slotsTable: dynamodb.Table
  userPool: cognito.UserPool
  userPoolClient: cognito.UserPoolClient
}

/**
 * ApiStack — creates Lambda functions and API Gateway HTTP API.
 *
 * All routes (except OPTIONS for CORS) require a valid Cognito JWT token.
 * Role-based access control is enforced inside each Lambda function.
 */
export class ApiStack extends cdk.Stack {
  public readonly apiUrl: string

  constructor(scope: Construct, id: string, props: ApiStackProps) {
    super(scope, id, props)

    const {
      usersTable,
      cabsTable,
      bookingsTable,
      slotsTable,
      userPool,
      userPoolClient,
    } = props

    // ── Shared Lambda environment variables ──────────────────────────────────
    // These are injected into every Lambda function automatically
    const sharedEnv = {
      USERS_TABLE: usersTable.tableName,
      CABS_TABLE: cabsTable.tableName,
      BOOKINGS_TABLE: bookingsTable.tableName,
      SLOTS_TABLE: slotsTable.tableName,
      USER_POOL_ID: userPool.userPoolId,
    }

    // ── Helper to create a Lambda function ──────────────────────────────────
    const createLambda = (name: string, handlerPath: string) => {
      // Create a dedicated CloudWatch log group for each Lambda function
      const logGroup = new logs.LogGroup(this, `${name}LogGroup`, {
        logGroupName: `/aws/lambda/iskon-${name.toLowerCase()}`,
        retention: logs.RetentionDays.ONE_MONTH,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      })

      const fn = new lambda.Function(this, name, {
        functionName: `iskon-${name.toLowerCase()}`,
        runtime: lambda.Runtime.NODEJS_20_X,
        // Points to the compiled JS output of the backend
        code: lambda.Code.fromAsset(path.join(__dirname, '../../backend/dist')),
        handler: handlerPath,
        environment: sharedEnv,
        timeout: cdk.Duration.seconds(30),
        memorySize: 256,
        logGroup,
      })

      // Grant this Lambda read/write access to all tables
      usersTable.grantReadWriteData(fn)
      cabsTable.grantReadWriteData(fn)
      bookingsTable.grantReadWriteData(fn)
      slotsTable.grantReadWriteData(fn)

      return fn
    }

    // ── Lambda Functions ─────────────────────────────────────────────────────
    const getAvailableCabsFn = createLambda('GetAvailableCabs', 'functions/cgm/getAvailableCabs.handler')
    const createBookingFn    = createLambda('CreateBooking',    'functions/cgm/createBooking.handler')
    const updateTripStatusFn = createLambda('UpdateTripStatus', 'functions/driver/updateTripStatus.handler')
    const releaseCabFn       = createLambda('ReleaseCab',       'functions/admin/releaseCab.handler')

    // ── Cognito JWT Authorizer ───────────────────────────────────────────────
    // API Gateway validates the JWT token automatically before calling Lambda
    const authorizer = new apigatewayAuthorizers.HttpJwtAuthorizer(
      'CognitoAuthorizer',
      `https://cognito-idp.${this.region}.amazonaws.com/${userPool.userPoolId}`,
      {
        jwtAudience: [userPoolClient.userPoolClientId],
      }
    )

    // ── HTTP API ─────────────────────────────────────────────────────────────
    const httpApi = new apigateway.HttpApi(this, 'IskonHttpApi', {
      apiName: 'iskon-cab-booking-api',
      description: 'Iskon Cab Booking API',
      corsPreflight: {
        allowOrigins: ['*'], // Tighten to your CloudFront URL after Phase 11
        allowMethods: [apigateway.CorsHttpMethod.ANY],
        allowHeaders: ['Content-Type', 'Authorization'],
        maxAge: cdk.Duration.days(1),
      },
    })

    // ── API Routes ───────────────────────────────────────────────────────────
    // CGM routes
    httpApi.addRoutes({
      path: '/v1/cgm/cabs/available',
      methods: [apigateway.HttpMethod.GET],
      integration: new apigatewayIntegrations.HttpLambdaIntegration('GetAvailableCabsIntegration', getAvailableCabsFn),
      authorizer,
    })

    httpApi.addRoutes({
      path: '/v1/cgm/bookings',
      methods: [apigateway.HttpMethod.POST],
      integration: new apigatewayIntegrations.HttpLambdaIntegration('CreateBookingIntegration', createBookingFn),
      authorizer,
    })

    // Driver routes
    httpApi.addRoutes({
      path: '/v1/driver/trips/{bookingId}/status',
      methods: [apigateway.HttpMethod.PATCH],
      integration: new apigatewayIntegrations.HttpLambdaIntegration('UpdateTripStatusIntegration', updateTripStatusFn),
      authorizer,
    })

    // Admin routes
    httpApi.addRoutes({
      path: '/v1/admin/cabs/{cabId}/status',
      methods: [apigateway.HttpMethod.PATCH],
      integration: new apigatewayIntegrations.HttpLambdaIntegration('ReleaseCabIntegration', releaseCabFn),
      authorizer,
    })

    this.apiUrl = httpApi.url!

    // ── CloudFormation Outputs ───────────────────────────────────────────────
    new cdk.CfnOutput(this, 'ApiUrl', {
      value: this.apiUrl,
      description: 'API Gateway URL - add to frontend .env as VITE_API_URL',
    })
  }
}
