---
title: Slack Plugin
description: Implements the notifications capability via Slack's bot API.
---

`@theholocron/holocron-plugin-slack` implements the `notifications` capability using a Slack bot token. It posts messages to channels via `chat.postMessage`.

## Install

```bash
pnpm add -D @theholocron/holocron-plugin-slack
```

## Capabilities

| Capability      | Token required                   |
| --------------- | -------------------------------- |
| `notifications` | `HOLOCRON_SLACK_TOKEN` (`slack`) |

## Config

```ts
providers: {
  notifications: ["slack", {
    // Optional: default channel id used when send() is called without a channel
    defaultChannel: "C0123456789",
  }],
}
```

### Options

| Option           | Required | Description                                                        |
| ---------------- | -------- | ------------------------------------------------------------------ |
| `defaultChannel` | No       | Slack channel id (e.g. `C0123456789`) used as the fallback channel |

## Authentication

### 1. Create a Slack app

1. Go to [api.slack.com/apps](https://api.slack.com/apps) and click **Create New App** → **From scratch**
2. Name it (e.g. "Holocron") and select your workspace

### 2. Add the bot scope

1. Under **OAuth & Permissions → Scopes → Bot Token Scopes**, click **Add an OAuth Scope**
2. Add **`chat:write`** — required to post messages
3. Optionally add **`channels:read`** if you want name-to-id resolution

### 3. Install to workspace and copy the token

1. Under **OAuth & Permissions**, click **Install to Workspace**
2. Approve the permissions
3. Copy the **Bot User OAuth Token** — it starts with `xoxb-`

### 4. Store the token

```bash
holocron auth set slack xoxb-xxxxxxxxxxxx-xxxxxxxxxxxx-xxxxxxxxxxxxxxxxxxxxxxxx
```

Or via env var:

```bash
export HOLOCRON_SLACK_TOKEN=xoxb-...
# Also recognized:
export SLACK_BOT_TOKEN=xoxb-...
```

:::note
The bot must be invited to the channel before it can post: `/invite @YourBotName`
:::

## What `notifications` provides

- `send(channel, message)` — post a plain-text message to a channel id. Falls back to `defaultChannel` when `channel` is an empty string.

## Example

```ts
import { createPlugin } from "@theholocron/holocron-plugin-slack";

const plugin = createPlugin({
  token: process.env.HOLOCRON_SLACK_TOKEN,
  defaultChannel: "C0123456789",
});
const notif = plugin.capabilities.notifications();

await notif.send("C0123456789", "Deploy complete :white_check_mark:");
// or use the default channel:
await notif.send("", "Deploy complete");
```
