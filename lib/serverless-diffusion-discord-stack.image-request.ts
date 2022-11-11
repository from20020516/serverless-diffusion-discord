import { ProxyHandler } from 'aws-lambda'
import { Lambda } from 'aws-sdk'
import { APIEmbed, GuildMember } from 'discord.js'
import { verifyKey, InteractionResponseType, InteractionType } from 'discord-interactions'

/** @see https://discord.com/developers/docs/interactions/application-commands#application-command-object-application-command-structure */
type PING = {
  type: InteractionType.PING,
  application_id: string,
  id: string,
  token: string,
  user?: {
    avatar?: string,
    avatar_decoration?: string,
    discriminator?: string,
    id: string,
    public_flags: number,
    username: string
  },
  version: number
}
type APPLICATION_COMMAND = {
  type: InteractionType.APPLICATION_COMMAND,
  application_id: string,
  channel_id: string,
  data: {
    id: string,
    name: string,
    options: {
      name: string,
      type: number,
      value: string
    }[],
    type: number,
    resolved?: {
      attachments: {
        [key: string]: {
          content_type: string,
          ephemeral: boolean,
          filename: string,
          height: number,
          id: string,
          proxy_url: string,
          size: number,
          url: string,
          width: number
        }
      }
    }
  },
  guild_id: string,
  guild_locale: string
  id: string,
  locale: string
  member: GuildMember,
  token: string,
  version: number
}

export type ImageRequestHandlerEnv = { region: string, FunctionName: string, bucketName: string, publicKey: string }
export const handler: ProxyHandler = async ({ headers, body }) => {
  try {
    const { publicKey, region, FunctionName, bucketName } = process.env as ImageRequestHandlerEnv
    const signature = headers['x-signature-ed25519']
    const timestamp = headers['x-signature-timestamp']

    if (!body || !signature || !timestamp || !publicKey)
      return { statusCode: 401, body: '' }
    if (!verifyKey(body, signature, timestamp, publicKey))
      return { statusCode: 401, body: '' }

    const payload = JSON.parse(body) as APPLICATION_COMMAND | PING
    console.log(JSON.stringify({ headers, body: payload }))

    if (payload.type === InteractionType.APPLICATION_COMMAND) {
      const { id, data: { name, options, resolved }, guild_id, channel_id, member: { user } } = payload
      if (name === 'ai') {
        const request = {
          prompt: options.find(option => option.name === 'prompt')?.value,
          init_image: ((id) => id ? resolved?.attachments[id].url : undefined)(options.find(option => option.name === 'init-image')?.value),
          model: options.find(option => option.name === 'model')?.value,
          num_inference_steps: options.find(option => option.name === 'num-inference-steps')?.value,
          guidance_scale: options.find(option => option.name === 'guidance-scale')?.value,
          mask: ((id) => id ? resolved?.attachments[id].url : undefined)(options.find(option => option.name === 'mask')?.value),
          seed: options.find(option => option.name === 'seed')?.value,
          s3_bucket_name: bucketName,
          s3_object_name: `output/${guild_id}/${channel_id}/${user.id}/${id}`,
        }
        if (request.prompt) {
          await new Lambda({ region, logger: console })
            .invokeAsync({ FunctionName, InvokeArgs: JSON.stringify(request) }).promise()

          const embeds: APIEmbed[] = []
          request.init_image && embeds.push({ title: 'init-image', image: { url: request.init_image } })
          request.mask && embeds.push({ title: 'mask', image: { url: request.mask } })

          return {
            statusCode: 200,
            body: JSON.stringify({
              type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
              data: {
                content: `> ${JSON.stringify(request)}`,
                embeds: embeds.length ? embeds : undefined,
              }
            })
          }
        }
      }
    }
    return {
      statusCode: 200,
      body: JSON.stringify({
        type: InteractionResponseType.PONG
      })
    }
  } catch ({ message }) {
    console.error(message)
    return { statusCode: 500, body: JSON.stringify(message) }
  }
}
