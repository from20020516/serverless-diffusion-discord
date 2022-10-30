import {
  Duration,
  IgnoreMode,
  RemovalPolicy,
  Stack,
  StackProps,
  aws_ec2 as ec2,
  aws_ecr_assets as ecra,
  aws_ecs as ecs,
  aws_efs as efs,
  aws_iam as iam,
  aws_lambda as lambda,
  aws_logs as logs,
  aws_s3 as s3,
  aws_s3_notifications as s3n,
  aws_stepfunctions as sfn,
  aws_stepfunctions_tasks as sfnt,
} from 'aws-cdk-lib'
import { Construct } from 'constructs'
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs'
import { ImageRequestHandlerEnv } from './serverless-diffusion-discord-stack.image-request'
import { ImageResponseHandlerEnv } from './serverless-diffusion-discord-stack.image-response'

export class ServerlessDiffusionDiscordStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props)

    const bucket = new s3.Bucket(this, 'Bucket', { autoDeleteObjects: true, removalPolicy: RemovalPolicy.DESTROY })
    const cluster = new ecs.Cluster(this, 'Cluster', { vpc: ec2.Vpc.fromLookup(this, 'VPC', { isDefault: true }) })
    const logGroup = new logs.LogGroup(this, 'LogGroup', { logGroupName: cluster.clusterName, removalPolicy: RemovalPolicy.DESTROY, retention: logs.RetentionDays.ONE_WEEK })

    const securityGroup = new ec2.SecurityGroup(this, 'SecurityGroup', { vpc: cluster.vpc, allowAllOutbound: true })
    securityGroup.addIngressRule(securityGroup, ec2.Port.allTraffic())

    const fs = new efs.FileSystem(this, 'FileSystem', {
      vpc: cluster.vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      removalPolicy: RemovalPolicy.DESTROY,
      securityGroup,
    })
    const ap = fs.addAccessPoint('AccessPoint', { path: '/' })
    const volume: ecs.Volume = {
      name: 'efs-volume',
      efsVolumeConfiguration: {
        authorizationConfig: {
          accessPointId: ap.accessPointId,
          iam: 'DISABLED',
        },
        fileSystemId: fs.fileSystemId,
        transitEncryption: 'ENABLED',
      },
    }

    const taskDefinition = new ecs.TaskDefinition(this, 'TaskDefinition', {
      compatibility: ecs.Compatibility.FARGATE,
      cpu: '16384',
      memoryMiB: '122880',
      runtimePlatform: {
        /** https://www.intel.co.jp/content/www/jp/ja/internet-of-things/openvino-toolkit.html */
        cpuArchitecture: ecs.CpuArchitecture.X86_64,
      },
      volumes: [volume],
    })
    bucket.grantWrite(taskDefinition.taskRole)

    const containerDefinition = taskDefinition.addContainer('Container', {
      image: ecs.ContainerImage.fromAsset('lib/container/', {
        platform: ecra.Platform.LINUX_AMD64,
        ignoreMode: IgnoreMode.GIT,
        exclude: [
          '*/*',
          '!lib/container'
        ]
      }),
      environment: {
        HOME: '/mnt/huggingface' /** instead of /root/.cache */
      },
      logging: ecs.LogDrivers.awsLogs({ streamPrefix: 'diffusion', logGroup }),
    })
    containerDefinition.addMountPoints({ containerPath: '/mnt/huggingface', sourceVolume: volume.name, readOnly: false })

    const stateMachine = new sfn.StateMachine(this, 'StateMachine', {
      definition: new sfnt.EcsRunTask(this, 'Task', {
        cluster,
        launchTarget: new sfnt.EcsFargateLaunchTarget({ platformVersion: ecs.FargatePlatformVersion.VERSION1_4 }),
        integrationPattern: sfn.IntegrationPattern.RUN_JOB,
        taskDefinition,
        inputPath: '$',
        assignPublicIp: true,
        securityGroups: [securityGroup],
        containerOverrides: [{
          containerDefinition,
          command: sfn.JsonPath.listAt('$.commands'),
        }],
        timeout: Duration.minutes(15),
      }),
    })

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
        stateMachineArn: stateMachine.stateMachineArn,
      } as ImageRequestHandlerEnv
    })
    imageRequestHandler.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['states:StartExecution'],
      resources: [stateMachine.stateMachineArn],
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
