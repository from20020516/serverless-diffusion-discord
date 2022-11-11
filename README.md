# serverless-diffusion-discord

Stable Diffusion Discord Bot interface.

![infrastructure](./README.drawio.png)


1. [Create your Discord App](https://discord.com/developers/applications).
2. Create your AWS resources.

```
npm install
npm run cdk deploy -c publicKey=$DISCORD_APP_PUBLIC_KEY -c botToken=$DISCORD_APP_BOT_TOKEN --all
```

3. Add `imageRequestHandler` function url (https://*.lambda-url.REGION.on.aws) to App `INTERACTIONS ENDPOINT URL`.
4. Add Discord App to your server with `bot` scope.
5. use `/ai` command in your server channel. enjoy!

## Disclaimer

The authors are not responsible for the content generated using this project. Please, don't use this project to produce illegal, harmful, offensive etc. content.
