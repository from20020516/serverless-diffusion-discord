import { S3Handler } from 'aws-lambda'
import { S3 } from 'aws-sdk'
import { AttachmentBuilder, Events, MessagePayload } from 'discord.js'
import client from './client'

export type ImageResponseHandlerEnv = { region: string, botToken: string }
export const handler: S3Handler = ({ Records }) => new Promise(async (resolve) => {
  const { botToken, region } = process.env as ImageResponseHandlerEnv
  client.on(Events.ClientReady, async (event) => {
    await Promise.all(Records.map(async ({ s3: { bucket: { name }, object: { key } } }) => {
      const { Metadata, Body } = await new S3({ logger: console, region: region }).getObject({ Bucket: name, Key: key }).promise()
      const { guildId, channelId, userId } = key.match(/(?<guildId>[0-9]+)\/(?<channelId>[0-9]+)\/(?<userId>[0-9]+)\//)?.groups ?? {}

      const channel = event.guilds.cache.get(guildId)?.channels.cache.get(channelId)
      const user = await event.users.fetch(userId)

      return channel?.isTextBased()
        ? channel.send(new MessagePayload(channel, {
          content: `> ${user.toString()} ${Metadata?.json}`,
          files: [new AttachmentBuilder(Body as Buffer)],
        }))
        : undefined
    }))
    client.destroy()
    resolve()
  })
  await client.login(botToken)
})
