import * as cdk from 'aws-cdk-lib'
import * as lambda from 'aws-cdk-lib/aws-lambda'
import * as apigateway from 'aws-cdk-lib/aws-apigatewayv2'
import * as apigatewayIntegrations from 'aws-cdk-lib/aws-apigatewayv2-integrations'
import * as apigatewayAuthorizers from 'aws-cdk-lib/aws-apigatewayv2-authorizers'
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb'
import * as cognito from 'aws-cdk-lib/aws-cognito'
import * as logs from 'aws-cdk-lib/aws-logs'
import * as iam from 'aws-cdk-lib/aws-iam'
import * as events from 'aws-cdk-lib/aws-events'
import * as targets from 'aws-cdk-lib/aws-events-targets'
import { Construct } from 'constructs'
import * as path from 'path'
import * as s3 from 'aws-cdk-lib/aws-s3'

interface ApiStackProps extends cdk.StackProps {
  usersTable: dynamodb.Table
  cabsTable: dynamodb.Table
  bookingsTable: dynamodb.Table
  slotsTable: dynamodb.Table
  projectsTable: dynamodb.Table
  profilePhotosBucket: s3.Bucket
  userPool: cognito.UserPool
  userPoolClient: cognito.UserPoolClient
  notificationsTable: dynamodb.Table
  connectionsTable: dynamodb.Table
}

export class ApiStack extends cdk.Stack {
  public readonly apiUrl: string
  public readonly wsUrl: string

  constructor(scope: Construct, id: string, props: ApiStackProps) {
    super(scope, id, props)

    const {
      usersTable, cabsTable, bookingsTable, slotsTable,
      projectsTable, profilePhotosBucket, userPool, userPoolClient,
    } = props

    // ── Shared Lambda environment ─────────────────────────────────────────────
    // WebSocket endpoint is injected after WS API creation (see below)
    const sharedEnv: Record<string, string> = {
      USERS_TABLE:        usersTable.tableName,
      CABS_TABLE:         cabsTable.tableName,
      BOOKINGS_TABLE:     bookingsTable.tableName,
      SLOTS_TABLE:        slotsTable.tableName,
      PROJECTS_TABLE:     projectsTable.tableName,
      NOTIFICATIONS_TABLE: props.notificationsTable.tableName,
      CONNECTIONS_TABLE:  props.connectionsTable.tableName,
      PROFILE_PHOTOS_BUCKET: profilePhotosBucket.bucketName,
      USER_POOL_ID:       userPool.userPoolId,
      COGNITO_USER_POOL_ID: userPool.userPoolId,
      COGNITO_CLIENT_ID:  userPoolClient.userPoolClientId,
      FIREBASE_SERVICE_ACCOUNT_JSON: process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '',
    }

    // ── Helper: create Lambda + log group ────────────────────────────────────
    const createLambda = (name: string, handlerPath: string, extraEnv?: Record<string, string>) => {
      const logGroup = new logs.LogGroup(this, `${name}LogGroup`, {
        logGroupName: `/aws/lambda/iskon-${name.toLowerCase()}`,
        retention: logs.RetentionDays.ONE_MONTH,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      })

      const fn = new lambda.Function(this, name, {
        functionName: `iskon-${name.toLowerCase()}`,
        runtime: lambda.Runtime.NODEJS_22_X,
        code: lambda.Code.fromAsset(path.join(__dirname, '../../backend/dist')),
        handler: handlerPath,
        environment: { ...sharedEnv, ...(extraEnv || {}) },
        timeout: cdk.Duration.seconds(30),
        memorySize: 256,
        logGroup,
      })

      // Grant access to all tables + bucket
      usersTable.grantReadWriteData(fn)
      cabsTable.grantReadWriteData(fn)
      bookingsTable.grantReadWriteData(fn)
      slotsTable.grantReadWriteData(fn)
      projectsTable.grantReadWriteData(fn)
      props.notificationsTable.grantReadWriteData(fn)
      props.connectionsTable.grantReadWriteData(fn)
      profilePhotosBucket.grantReadWrite(fn)

      return fn
    }

    // ── HTTP Lambdas ──────────────────────────────────────────────────────────
    const getAvailableCabsFn  = createLambda('GetAvailableCabs',  'functions/cgm/getAvailableCabs.handler')
    const createBookingFn     = createLambda('CreateBooking',     'functions/cgm/createBooking.handler')
    const getMyBookingsFn     = createLambda('GetMyBookings',     'functions/cgm/getMyBookings.handler')
    const updateTripStatusFn  = createLambda('UpdateTripStatus',  'functions/driver/updateTripStatus.handler')
    const getMyTripsFn        = createLambda('GetMyTrips',        'functions/driver/getMyTrips.handler')
    const getMyCabFn          = createLambda('GetMyCab',          'functions/driver/getMyCab.handler')
    const respondBookingFn    = createLambda('RespondBooking',    'functions/driver/respondBooking.handler')
    const releaseCabFn        = createLambda('ReleaseCab',        'functions/admin/releaseCab.handler')
    const createUserFn        = createLambda('CreateUser',        'functions/admin/createUser.handler')
    const resetUserPasswordFn = createLambda('ResetUserPassword', 'functions/admin/createUser.resetPassword')
    const toggleUserStatusFn  = createLambda('ToggleUserStatus',  'functions/admin/createUser.toggleUserStatus')
    const projectsFn          = createLambda('Projects',          'functions/admin/projects.handler')
    const cabsFn              = createLambda('Cabs',              'functions/admin/cabs.handler')
    const profilePhotosFn     = createLambda('ProfilePhotos',     'functions/admin/profilePhotos.handler')
    const adminStatsFn        = createLambda('AdminStats',        'functions/admin/stats.handler')
    const adminBookingsFn     = createLambda('AdminBookings',     'functions/admin/bookings.handler')
    const seedFn              = createLambda('SeedProjects',      'functions/admin/seedHandler.handler')
    const getNotificationsFn  = createLambda('GetNotifications',  'functions/notifications/getNotifications.handler')
    const markReadFn          = createLambda('MarkNotifRead',     'functions/notifications/markRead.handler')
    const registerPushTokenFn = createLambda('RegisterPushToken', 'functions/notifications/registerPushToken.handler')
    const expireBookingsFn    = createLambda('ExpireBookings',    'functions/scheduler/expireBookings.handler')

    // ── WebSocket Lambdas ─────────────────────────────────────────────────────
    const wsConnectFn    = createLambda('WsConnect',    'functions/websocket/connect.handler')
    const wsDisconnectFn = createLambda('WsDisconnect', 'functions/websocket/disconnect.handler')
    const wsAuthFn       = createLambda('WsAuthorizer', 'functions/websocket/authorizer.handler')

    // ── Cognito permissions ───────────────────────────────────────────────────
    userPool.grant(createUserFn,        'cognito-idp:AdminCreateUser', 'cognito-idp:AdminSetUserPassword', 'cognito-idp:ListUsers')
    userPool.grant(resetUserPasswordFn, 'cognito-idp:AdminSetUserPassword')
    userPool.grant(toggleUserStatusFn,  'cognito-idp:AdminEnableUser', 'cognito-idp:AdminDisableUser')
    userPool.grant(adminStatsFn,        'cognito-idp:ListUsers')

    // ── Cognito JWT Authorizer (HTTP API) ─────────────────────────────────────
    const authorizer = new apigatewayAuthorizers.HttpJwtAuthorizer(
      'CognitoAuthorizer',
      `https://cognito-idp.${this.region}.amazonaws.com/${userPool.userPoolId}`,
      { jwtAudience: [userPoolClient.userPoolClientId] }
    )

    // ── HTTP API ──────────────────────────────────────────────────────────────
    const httpApi = new apigateway.HttpApi(this, 'IskonHttpApi', {
      apiName: 'iskon-cab-booking-api',
      description: 'Iskon Cab Booking HTTP API',
      corsPreflight: {
        allowOrigins: ['*'],
        allowMethods: [apigateway.CorsHttpMethod.ANY],
        allowHeaders: ['Content-Type', 'Authorization'],
        maxAge: cdk.Duration.days(1),
      },
    })

    // Helper to add a route
    const addRoute = (
      p: string,
      methods: apigateway.HttpMethod[],
      fn: lambda.Function,
      integId: string
    ) => httpApi.addRoutes({
      path: p,
      methods,
      integration: new apigatewayIntegrations.HttpLambdaIntegration(integId, fn),
      authorizer,
    })

    // CGM
    addRoute('/v1/cgm/cabs/available',   [apigateway.HttpMethod.GET],        getAvailableCabsFn,  'GetAvailableCabsI')
    addRoute('/v1/cgm/bookings',         [apigateway.HttpMethod.POST],        createBookingFn,    'CreateBookingI')
    addRoute('/v1/cgm/bookings',         [apigateway.HttpMethod.GET],         getMyBookingsFn,    'GetMyBookingsI')

    // Driver
    addRoute('/v1/driver/trips/{bookingId}/status', [apigateway.HttpMethod.PATCH], updateTripStatusFn,  'UpdateTripStatusI')
    addRoute('/v1/driver/trips',                    [apigateway.HttpMethod.GET],   getMyTripsFn,        'GetMyTripsI')
    addRoute('/v1/driver/cab',                      [apigateway.HttpMethod.GET],   getMyCabFn,          'GetMyCabI')
    addRoute('/v1/driver/bookings/{bookingId}/decision', [apigateway.HttpMethod.PATCH], respondBookingFn, 'RespondBookingI')

    // Admin — cabs
    addRoute('/v1/admin/cabs',           [apigateway.HttpMethod.GET, apigateway.HttpMethod.POST], cabsFn,       'CabsI')
    addRoute('/v1/admin/cabs/{cabId}',   [apigateway.HttpMethod.PATCH],                           cabsFn,       'CabUpdateI')
    addRoute('/v1/admin/cabs/{cabId}/status', [apigateway.HttpMethod.PATCH],                      releaseCabFn, 'ReleaseCabI')

    // Admin — users
    addRoute('/v1/admin/users',                        [apigateway.HttpMethod.GET, apigateway.HttpMethod.POST], createUserFn,        'UsersI')
    addRoute('/v1/admin/users/{username}/password',    [apigateway.HttpMethod.PATCH],                           resetUserPasswordFn, 'ResetPassI')
    addRoute('/v1/admin/users/{username}/status',      [apigateway.HttpMethod.PATCH],                           toggleUserStatusFn,  'ToggleStatusI')

    // Admin — bookings
    addRoute('/v1/admin/bookings',              [apigateway.HttpMethod.GET],   adminBookingsFn, 'AdminBookingsI')
    addRoute('/v1/admin/bookings/{bookingId}',  [apigateway.HttpMethod.PATCH], adminBookingsFn, 'AdminBookingUpdateI')

    // Admin — stats & seed
    addRoute('/v1/admin/stats', [apigateway.HttpMethod.GET],  adminStatsFn, 'AdminStatsI')
    addRoute('/v1/admin/seed',  [apigateway.HttpMethod.POST], seedFn,       'SeedI')

    // Projects
    addRoute('/v1/projects',              [apigateway.HttpMethod.GET, apigateway.HttpMethod.POST], projectsFn, 'ProjectsI')
    addRoute('/v1/projects/{projectId}',  [apigateway.HttpMethod.PATCH, apigateway.HttpMethod.DELETE], projectsFn, 'ProjectUpdateI')

    // Profile photos
    addRoute('/v1/profile-photos/{userId}', [apigateway.HttpMethod.GET, apigateway.HttpMethod.PUT], profilePhotosFn, 'ProfilePhotosI')

    // Notifications
    addRoute('/v1/notifications',                       [apigateway.HttpMethod.GET],   getNotificationsFn, 'GetNotifsI')
    addRoute('/v1/notifications/{notificationId}/read', [apigateway.HttpMethod.PATCH], markReadFn,         'MarkReadI')
    addRoute('/v1/notifications/push-token',             [apigateway.HttpMethod.POST],  registerPushTokenFn, 'RegisterPushTokenI')

    // ── EventBridge scheduler ─────────────────────────────────────────────────
    new events.Rule(this, 'ExpireBookingsSchedule', {
      schedule: events.Schedule.rate(cdk.Duration.minutes(1)),
      targets: [new targets.LambdaFunction(expireBookingsFn)],
    })

    this.apiUrl = httpApi.url!

    // ── WebSocket API ─────────────────────────────────────────────────────────
    // Uses API Gateway V2 WebSocket API for real-time push notifications
    const wsApi = new apigateway.WebSocketApi(this, 'IskonWsApi', {
      apiName: 'iskon-notifications-ws',
      description: 'Real-time notifications WebSocket',
      connectRouteOptions: {
        integration: new apigatewayIntegrations.WebSocketLambdaIntegration('WsConnectI', wsConnectFn),
        authorizer: new apigatewayAuthorizers.WebSocketLambdaAuthorizer(
          'WsLambdaAuthorizer',
          wsAuthFn,
          {
            authorizerName: 'CognitoTokenAuthorizer',
            identitySource: ['route.request.querystring.token'],
          }
        ),
      },
      disconnectRouteOptions: {
        integration: new apigatewayIntegrations.WebSocketLambdaIntegration('WsDisconnectI', wsDisconnectFn),
      },
    })

    const wsStageName = 'prod'
    const wsStage = new apigateway.WebSocketStage(this, 'IskonWsStage', {
      webSocketApi: wsApi,
      stageName: wsStageName,
      autoDeploy: true,
    })

    this.wsUrl = wsStage.url

    // WebSocket endpoint for Lambda-to-client push (PostToConnection)
    const wsCallbackUrl = `https://${wsApi.apiId}.execute-api.${this.region}.amazonaws.com/${wsStageName}`
    const wsEnv = { WEBSOCKET_ENDPOINT: wsCallbackUrl }

    // Inject WEBSOCKET_ENDPOINT into all Lambdas that need to push notifications
    const pushingLambdas = [
      createBookingFn, updateTripStatusFn, respondBookingFn,
      expireBookingsFn, adminBookingsFn, getNotificationsFn,
    ]
    for (const fn of pushingLambdas) {
      fn.addEnvironment('WEBSOCKET_ENDPOINT', wsCallbackUrl)
    }

    // Grant those Lambdas permission to call PostToConnection
    const wsMgmtArn = `arn:aws:execute-api:${this.region}:${this.account}:${wsApi.apiId}/${wsStageName}/POST/@connections/*`
    const wsMgmtPolicy = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['execute-api:ManageConnections'],
      resources: [wsMgmtArn],
    })
    for (const fn of pushingLambdas) {
      fn.addToRolePolicy(wsMgmtPolicy)
    }

    // ── CloudFormation Outputs ────────────────────────────────────────────────
    new cdk.CfnOutput(this, 'ApiUrl', {
      value: this.apiUrl,
      description: 'HTTP API URL — set as VITE_API_URL in frontend .env',
    })
    new cdk.CfnOutput(this, 'WebSocketUrl', {
      value: this.wsUrl,
      description: 'WebSocket URL — set as VITE_WEBSOCKET_URL in frontend .env',
    })
    new cdk.CfnOutput(this, 'WsCallbackUrl', {
      value: wsCallbackUrl,
      description: 'WebSocket Management API endpoint (internal)',
    })
  }
}
