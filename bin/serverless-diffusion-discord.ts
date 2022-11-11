#!/usr/bin/env node
import 'source-map-support/register'
import * as cdk from 'aws-cdk-lib'
import { VPCStack } from '../lib/vpc-stack'
import { ServerlessDiffusionDiscordStack } from '../lib/serverless-diffusion-discord-stack'
import { commandRegister } from '../lib/client'

const app = new cdk.App()
const env = { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION }

const vpcStack = new VPCStack(app, 'VPCStack', { env })
const { vpc, securityGroup } = vpcStack
new ServerlessDiffusionDiscordStack(app, 'ServerlessDiffusionDiscordStack', { env, vpc, securityGroup })
    .addDependency(vpcStack)

commandRegister(app.node.tryGetContext('botToken'))
