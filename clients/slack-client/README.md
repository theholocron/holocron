# @theholocron/slack-client

A TypeScript client for the Slack Web API — wraps `auth.test` and `chat.postMessage`.

## Installation

```bash
pnpm add @theholocron/slack-client
```

## Usage

```ts
import { createSlackClient } from "@theholocron/slack-client";

const client = createSlackClient({
  token: process.env.SLACK_BOT_TOKEN!,
});

const identity = await client.auth.test();
console.log(identity.team, identity.user);

await client.chat.postMessage("#deploys", "Deploy finished ✅");
```

Slack's Web API always responds with HTTP 200 and an `ok` field signalling
success — a non-`ok` response throws `ProviderApiError` the same way a
non-2xx response does for every other client here.

## API

### `createSlackClient(opts)`

| Option    | Type           | Default                 | Description                   |
| --------- | -------------- | ----------------------- | ----------------------------- |
| `token`   | `string`       | —                       | Slack bot/user OAuth token    |
| `baseUrl` | `string`       | `https://slack.com/api` | Override base URL for testing |
| `fetch`   | `typeof fetch` | `globalThis.fetch`      | Override fetch for testing    |

Returns a client with two resource namespaces:

#### `client.auth`

| Method   | Description                                    |
| -------- | ---------------------------------------------- |
| `test()` | `POST auth.test` — verify the token's identity |

#### `client.chat`

| Method                       | Description                              |
| ---------------------------- | ---------------------------------------- |
| `postMessage(channel, text)` | `POST chat.postMessage` — send a message |

## License

GPL-3.0 © [Newton Koumantzelis](https://github.com/iamnewton)
