import * as cdk from 'aws-cdk-lib'
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb'
import * as s3 from 'aws-cdk-lib/aws-s3'
import { Construct } from 'constructs'

/**
 * DatabaseStack — creates all DynamoDB tables for the Iskon Cab Booking system.
 *
 * Uses PAY_PER_REQUEST (on-demand) billing — no capacity planning needed,
 * and cost is near-zero for an internal app with low traffic.
 */
export class DatabaseStack extends cdk.Stack {
  // Expose tables so ApiStack can grant Lambda functions access to them
  public readonly usersTable: dynamodb.Table
  public readonly cabsTable: dynamodb.Table
  public readonly bookingsTable: dynamodb.Table
  public readonly slotsTable: dynamodb.Table
  public readonly projectsTable: dynamodb.Table
  public readonly profilePhotosBucket: s3.Bucket

  constructor(scope: Construct, id: string, props: cdk.StackProps) {
    super(scope, id, props)

    // ── Users Table ──────────────────────────────────────────────────────────
    this.usersTable = new dynamodb.Table(this, 'UsersTable', {
      tableName: 'iskon-users',
      partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      // Protect against accidental deletion
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
    })

    // GSI: list all users by role (Admin uses this to list all CGMs, Drivers)
    this.usersTable.addGlobalSecondaryIndex({
      indexName: 'role-index',
      partitionKey: { name: 'role', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    })

    // ── Cabs Table ───────────────────────────────────────────────────────────
    this.cabsTable = new dynamodb.Table(this, 'CabsTable', {
      tableName: 'iskon-cabs',
      partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
    })

    // ── Bookings Table ───────────────────────────────────────────────────────
    this.bookingsTable = new dynamodb.Table(this, 'BookingsTable', {
      tableName: 'iskon-bookings',
      partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
    })

    // GSI 1: CGM sees their own bookings, sorted by date
    this.bookingsTable.addGlobalSecondaryIndex({
      indexName: 'cgm-bookings-index',
      partitionKey: { name: 'cgmId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'bookingDate', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    })

    // GSI 2: Driver sees their assigned trips, sorted by date
    this.bookingsTable.addGlobalSecondaryIndex({
      indexName: 'driver-bookings-index',
      partitionKey: { name: 'driverId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'bookingDate', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    })

    // GSI 3: Check if a cab is already booked for a given date+slot
    // Used for double-booking prevention query BEFORE the transaction
    this.bookingsTable.addGlobalSecondaryIndex({
      indexName: 'cab-slot-index',
      partitionKey: { name: 'cabId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'bookingDateSlot', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.KEYS_ONLY,
    })

    // ── Slots Table ──────────────────────────────────────────────────────────
    this.slotsTable = new dynamodb.Table(this, 'SlotsTable', {
      tableName: 'iskon-slots',
      partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    })

    this.projectsTable = new dynamodb.Table(this, 'ProjectsTable', {
      tableName: 'iskon-projects',
      partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    })

    this.profilePhotosBucket = new s3.Bucket(this, 'ProfilePhotosBucket', {
      bucketName: `iskon-profile-photos-${this.account}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    })

    // ── CloudFormation Outputs ───────────────────────────────────────────────
    new cdk.CfnOutput(this, 'UsersTableName', { value: this.usersTable.tableName })
    new cdk.CfnOutput(this, 'CabsTableName', { value: this.cabsTable.tableName })
    new cdk.CfnOutput(this, 'BookingsTableName', { value: this.bookingsTable.tableName })
    new cdk.CfnOutput(this, 'SlotsTableName', { value: this.slotsTable.tableName })
      new cdk.CfnOutput(this, 'ProjectsTableName', { value: this.projectsTable.tableName })
      new cdk.CfnOutput(this, 'ProfilePhotosBucketName', { value: this.profilePhotosBucket.bucketName })
  }
}
