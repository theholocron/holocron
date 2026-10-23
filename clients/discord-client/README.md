# @theholocron/discord-client

A TypeScript client for Discord — posts messages through webhooks, and (with a bot token) provisions a server's channels, roles and webhooks.

## Installation

```bash
pnpm add @theholocron/discord-client
```

## Usage

```ts
import { createDiscordClient, parseWebhookUrl } from "@theholocron/discord-client";

const client = createDiscordClient();

const { id, token } = parseWebhookUrl(process.env.DISCORD_WEBHOOK_URL!);
const info = await client.webhooks.get(id, token);
console.log(info.name);

await client.webhooks.execute(id, token, "Deploy finished ✅");
```

Discord webhooks authenticate via the id+token embedded in the URL itself,
not an `Authorization` header — `createDiscordClient` takes no `token`
option; each call supplies its own.

## API

### `createDiscordClient(opts?)`

| Option    | Type           | Default                       | Description                   |
| --------- | -------------- | ----------------------------- | ----------------------------- |
| `baseUrl` | `string`       | `https://discord.com/api/v10` | Override base URL for testing |
| `fetch`   | `typeof fetch` | `globalThis.fetch`            | Override fetch for testing    |

Returns a client with one resource namespace:

#### `client.webhooks`

| Method                        | Description                                    |
| ----------------------------- | ---------------------------------------------- |
| `get(id, token)`              | `GET /webhooks/{id}/{token}` — webhook info    |
| `execute(id, token, content)` | `POST /webhooks/{id}/{token}` — post a message |

### `parseWebhookUrl(url)`

Parses a Discord webhook URL (e.g. `https://discord.com/api/webhooks/<id>/<token>`)
into `{ id, token }`.

## Bot client — provisioning a server

`createDiscordBotClient` authenticates as a bot (`Authorization: Bot <token>`)
and covers what you need to set a server up. `channels.createMessage` posts as the
bot (needs View Channel and Send Messages in that channel); to post through a
channel webhook with no token, use `createDiscordClient().webhooks.execute`.

```ts
import { ChannelType, createDiscordBotClient } from "@theholocron/discord-client";

const bot = createDiscordBotClient({
  botToken: process.env.DISCORD_BOT_TOKEN!,
});

const category = await bot.guilds.createChannel(guildId, {
  name: "ALERTS",
  type: ChannelType.Category,
});
const channel = await bot.guilds.createChannel(guildId, {
  name: "alerts",
  parent_id: category.id,
});
const hook = await bot.channels.createWebhook(channel.id, {
  name: "repo-sync",
});
console.log(hook.url); // a secret -- Discord returns it only for webhooks this bot created
```

### `createDiscordBotClient(opts)`

| Option       | Type           | Default                       | Description                   |
| ------------ | -------------- | ----------------------------- | ----------------------------- |
| `botToken`   | `string`       | _(required)_                  | Bot token                     |
| `baseUrl`    | `string`       | `https://discord.com/api/v10` | Override base URL for testing |
| `fetch`      | `typeof fetch` | `globalThis.fetch`            | Override fetch for testing    |
| `timeoutMs`  | `number`       | `15000`                       | Per-request deadline          |
| `maxRetries` | `number`       | `3`                           | Retries after a 429           |

`baseUrl` is a test seam: the bot token is sent to whatever host it names, so
never derive it from untrusted input. Ids passed to any method must be Discord
snowflakes (digits only); anything else throws before a request is made.

A 429 is retried, up to `maxRetries` times, waiting for the `Retry-After` Discord
sends; a wait longer than 10 seconds fails immediately instead. A request that
runs past `timeoutMs` is aborted. Other errors are not retried, and the
`create*` calls are not idempotent: if a response is lost after Discord created
the resource, look it up by name before creating it again. A webhook created
that way cannot have its URL read back, since Discord returns the token only on
the create response.

| Resource          | Methods                                                                                                                                                     |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `client.users`    | `me()` — `GET /users/@me`, a cheap token check                                                                                                              |
| `client.guilds`   | `get`, `modify`, `channels`, `createChannel`, `roles`, `createRole`, `modifyRole`, `welcomeScreen`, `modifyWelcomeScreen`, `onboarding`, `modifyOnboarding` |
| `client.channels` | `modify`, `webhooks`, `createWebhook`, `createMessage`                                                                                                      |
| `client.webhooks` | `modify` (name, avatar), `delete`                                                                                                                           |

`permissions([...names])` builds the decimal-string bitfield Discord expects, and
`permissionNames(bitfield)` reads one back; `Permission` holds the bits themselves.
Welcome screen and onboarding only work once the server has the community
features on, and `modifyOnboarding` is a `PUT` that replaces the whole config.
`channels.createMessage` turns every mention off unless `allowed_mentions` says
otherwise.

The bot needs Manage Channels, Manage Roles, Manage Webhooks and (for server settings, welcome screen and onboarding) Manage Server in the server, plus View Channel and Send Messages in any channel it posts to with `channels.createMessage`.
Discord only returns a webhook's `token`/`url` for webhooks the same
application created, so a pre-existing webhook can be found by name but its URL
cannot be read back.

## License

GPL-3.0 © [Newton Koumantzelis](https://github.com/iamnewton)
