import * as cdk from 'aws-cdk-lib'
import * as cognito from 'aws-cdk-lib/aws-cognito'
import { Construct } from 'constructs'

/**
 * AuthStack — creates the Amazon Cognito User Pool for all app users.
 *
 * A single User Pool holds CGMs, Drivers, and Admins.
 * Role is stored as a custom attribute "custom:role" on each user.
 * Cognito handles password hashing, JWT issuance, and token validation.
 */
export class AuthStack extends cdk.Stack {
  public readonly userPool: cognito.UserPool
  public readonly userPoolClient: cognito.UserPoolClient

  constructor(scope: Construct, id: string, props: cdk.StackProps) {
    super(scope, id, props)

    // ── User Pool ────────────────────────────────────────────────────────────
    this.userPool = new cognito.UserPool(this, 'IskonUserPool', {
      userPoolName: 'iskon-users',
      // Admin creates users — users do NOT self-register (internal app)
      selfSignUpEnabled: false,
      signInAliases: {
        email: true,
      },
      autoVerify: {
        email: true,
      },
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: false,
      },
      // Custom attributes stored on each user's profile
      customAttributes: {
        // The user's role: CGM, DRIVER, or ADMIN
        role: new cognito.StringAttribute({ mutable: true }),
        // The user's full name
        name: new cognito.StringAttribute({ mutable: true }),
        // The user's mobile number
        mobile: new cognito.StringAttribute({ mutable: true }),
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    })

    // ── User Pool Client ─────────────────────────────────────────────────────
    // This is the "app client" the frontend and mobile app use to authenticate
    this.userPoolClient = new cognito.UserPoolClient(this, 'IskonUserPoolClient', {
      userPool: this.userPool,
      userPoolClientName: 'iskon-web-client',
      authFlows: {
        // USER_SRP_AUTH is the secure authentication flow (password never sent in plaintext)
        userSrp: true,
        // Allow admin to set temporary passwords
        adminUserPassword: true,
      },
      // Token validity periods
      accessTokenValidity: cdk.Duration.hours(8),
      idTokenValidity: cdk.Duration.hours(8),
      refreshTokenValidity: cdk.Duration.days(30),
      generateSecret: false, // No secret needed for a browser/mobile app
    })

    // ── CloudFormation Outputs ───────────────────────────────────────────────
    new cdk.CfnOutput(this, 'UserPoolId', {
      value: this.userPool.userPoolId,
      description: 'Cognito User Pool ID - add to frontend .env as VITE_COGNITO_USER_POOL_ID',
    })
    new cdk.CfnOutput(this, 'UserPoolClientId', {
      value: this.userPoolClient.userPoolClientId,
      description: 'Cognito App Client ID - add to frontend .env as VITE_COGNITO_CLIENT_ID',
    })
  }
}
