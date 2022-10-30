#!/usr/bin/env node
import 'source-map-support/register'
import * as cdk from 'aws-cdk-lib'
import { ServerlessDiffusionDiscordStack } from '../lib/serverless-diffusion-discord-stack'
import { commandRegister } from '../lib/client'

const app = new cdk.App()
new ServerlessDiffusionDiscordStack(app, 'ServerlessDiffusionDiscordStack', {
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION },
})

commandRegister(app.node.tryGetContext('botToken'))
