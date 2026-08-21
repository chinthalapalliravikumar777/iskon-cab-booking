import * as cdk from 'aws-cdk-lib'
import * as s3 from 'aws-cdk-lib/aws-s3'
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront'
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins'
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment'
import { Construct } from 'constructs'
import * as path from 'path'

interface HostingStackProps extends cdk.StackProps {
  apiUrl: string
}

/**
 * HostingStack — hosts the React website on S3 + CloudFront.
 *
 * S3 stores the built React files.
 * CloudFront serves them globally with HTTPS and caching.
 * This is the cheapest and most scalable way to host a static React app on AWS.
 *
 * Cost: S3 storage is cents/month. CloudFront free tier covers 1TB/month.
 */
export class HostingStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: HostingStackProps) {
    super(scope, id, props)

    // ── S3 Bucket ────────────────────────────────────────────────────────────
    // Block all public access — CloudFront will be the only way to access files
    const websiteBucket = new s3.Bucket(this, 'WebsiteBucket', {
      bucketName: `iskon-cab-booking-website-${this.account}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      versioned: false,
    })

    // ── CloudFront Distribution ──────────────────────────────────────────────
    const distribution = new cloudfront.Distribution(this, 'WebsiteDistribution', {
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(websiteBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
      },
      // Redirect all 404s to index.html so React Router handles the routing
      errorResponses: [
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
        },
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
        },
      ],
      defaultRootObject: 'index.html',
      comment: 'Iskon Cab Booking Website',
    })

    // ── Deploy built frontend files to S3 ───────────────────────────────────
    // This runs during cdk deploy and uploads the React build output
    new s3deploy.BucketDeployment(this, 'DeployWebsite', {
      sources: [s3deploy.Source.asset(path.join(__dirname, '../../frontend/dist'))],
      destinationBucket: websiteBucket,
      distribution,
      distributionPaths: ['/*'], // Invalidate CloudFront cache on every deploy
    })

    // ── CloudFormation Outputs ───────────────────────────────────────────────
    new cdk.CfnOutput(this, 'WebsiteUrl', {
      value: `https://${distribution.distributionDomainName}`,
      description: 'Your website URL',
    })
    new cdk.CfnOutput(this, 'CloudFrontDistributionId', {
      value: distribution.distributionId,
    })
  }
}
