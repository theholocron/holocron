# @theholocron/discord-client

A TypeScript client for the Discord webhooks API — reads a webhook's info and posts messages through it.

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

## License

GPL-3.0 © [Newton Koumantzelis](https://github.com/iamnewton)
