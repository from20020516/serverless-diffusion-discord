import {
  Duration,
  IgnoreMode,
  RemovalPolicy,
  Stack,
  StackProps,
  aws_ec2 as ec2,
  aws_ecr_assets as ecra,
  aws_efs as efs,
  aws_iam as iam,
  aws_lambda as lambda,
  aws_s3 as s3,
  aws_s3_notifications as s3n,
} from 'aws-cdk-lib'
import { Construct } from 'constructs'
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs'
import { ImageRequestHandlerEnv } from './serverless-diffusion-discord-stack.image-request'
import { ImageResponseHandlerEnv } from './serverless-diffusion-discord-stack.image-response'

interface ServerlessDiffusionDiscordStackProps extends StackProps {
  vpc: ec2.IVpc
  securityGroup: ec2.ISecurityGroup
}
export class ServerlessDiffusionDiscordStack extends Stack {
  constructor(scope: Construct, id: string, props?: ServerlessDiffusionDiscordStackProps) {
    super(scope, id, props)

    const { vpc, securityGroup } = props!

    const bucket = new s3.Bucket(this, 'Bucket', { autoDeleteObjects: true, removalPolicy: RemovalPolicy.DESTROY })
    const fs = new efs.FileSystem(this, 'FileSystem', {
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      removalPolicy: RemovalPolicy.DESTROY,
      securityGroup,
    })
    const ap = fs.addAccessPoint('AccessPoint', {
      path: '/huggingface',
      posixUser: {
        uid: '1000',
        gid: '1000'
      },
      createAcl: {
        ownerUid: '1000',
        ownerGid: '1000',
        permissions: '755'
      }
    })
    ap.applyRemovalPolicy(RemovalPolicy.DESTROY)

    const imageHandler = new lambda.DockerImageFunction(this, 'StableDiffusion', {
      code: lambda.DockerImageCode.fromImageAsset('lib/lambda/', {
        platform: ecra.Platform.LINUX_AMD64,
        file: 'Dockerfile',
        ignoreMode: IgnoreMode.GIT,
        exclude: ['*/*', '!lib/lambda'],
        target: 'production',
      }),
      architecture: lambda.Architecture.X86_64,
      memorySize: 10240,
      timeout: Duration.minutes(10),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      securityGroups: [securityGroup],
      filesystem: lambda.FileSystem.fromEfsAccessPoint(ap, '/mnt/huggingface'),
      environment: {
        BUCKET: bucket.bucketName,
        HOME: '/mnt/huggingface' /** instead of /root/.cache */
      },
    })
    bucket.grantReadWrite(imageHandler)
    imageHandler.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'elasticfilesystem:ClientRootAccess',
        'elasticfilesystem:ClientWrite',
        'elasticfilesystem:ClientMount',
      ],
      resources: [fs.fileSystemArn]
    }))

    const imageRequestHandler = new NodejsFunction(this, 'image-request', {
      runtime: lambda.Runtime.NODEJS_16_X,
      architecture: lambda.Architecture.ARM_64,
      memorySize: 256,
      /**
       * > you must send an initial response within 3 seconds of receiving the event.
       * @see https://discord.com/developers/docs/interactions/receiving-and-responding
       */
      timeout: Duration.seconds(3),
      environment: {
        publicKey: this.node.tryGetContext('publicKey'),
        region: this.region,
        bucketName: bucket.bucketName,
        FunctionName: imageHandler.functionArn,
      } as ImageRequestHandlerEnv
    })
    imageRequestHandler.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['lambda:InvokeFunction'],
      resources: [imageHandler.functionArn],
    }))
    imageRequestHandler.addFunctionUrl({ authType: lambda.FunctionUrlAuthType.NONE })

    const imageResponseHandler = new NodejsFunction(this, 'image-response', {
      runtime: lambda.Runtime.NODEJS_16_X,
      architecture: lambda.Architecture.ARM_64,
      memorySize: 256,
      timeout: Duration.seconds(10),
      environment: {
        botToken: this.node.tryGetContext('botToken'),
        region: this.region,
        NODE_OPTIONS: '--no-warnings',
      } as ImageResponseHandlerEnv
    })
    bucket.grantRead(imageResponseHandler)
    bucket.addEventNotification(s3.EventType.OBJECT_CREATED, new s3n.LambdaDestination(imageResponseHandler), { prefix: 'output/' })
  }
}
