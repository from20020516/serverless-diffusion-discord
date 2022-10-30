#!/usr/bin/env node
import 'source-map-support/register'
import * as cdk from 'aws-cdk-lib'
import { ServerlessDiffusionDiscordStack } from '../lib/serverless-diffusion-discord-stack'
import { Events, REST, Routes, SlashCommandBuilder } from 'discord.js'
import client from '../lib/client'
import * as context from '../cdk.context.json'

(async () => {
  const app = new cdk.App()
  new ServerlessDiffusionDiscordStack(app, 'ServerlessDiffusionDiscordStack', {
    env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION },
  })

  const botToken = context.botToken
  const restClient = new REST({ version: '10' }).setToken(botToken)
  const commands = [
    new SlashCommandBuilder()
      .setName('ai')
      .setDescription('キーワードからAIが画像を生成します。')
      .addStringOption(option => option.setName('prompt').setDescription('prompt').setRequired(false))
      .addAttachmentOption(option => option.setName('init-image').setDescription('init-image').setRequired(false))
      .addIntegerOption(option => option.setName('guidance-scale').setDescription('guidance-scale').setMaxValue(15).setMinValue(0).setRequired(false))
      .addIntegerOption(option => option.setName('num-inference-steps').setDescription('num-inference-steps').setMaxValue(32).setMinValue(1).setRequired(false))
      .addIntegerOption(option => option.setName('seed').setDescription('seed').setMaxValue(2 ** 32 / 2 - 1).setMinValue(0).setRequired(false))
      .setDMPermission(false)
  ]
  client.once(Events.ClientReady, async event => {
    const serverAppCommands = await restClient.get(Routes.applicationCommands(event.user.id)) as { id: string }[]
    await Promise.all(serverAppCommands.map(cmd => restClient.delete(Routes.applicationCommand(event.user.id, cmd.id))))
    await restClient.put(Routes.applicationCommands(event.user.id), { body: commands })
    return client.destroy()
  })
  client.login(botToken)
})()
