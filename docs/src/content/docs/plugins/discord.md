---
title: Discord Plugin
description: Implements the notifications capability via Discord incoming webhooks.
---

`@theholocron/holocron-plugin-discord` implements the `notifications` capability using Discord incoming webhooks. No bot account or server permissions are required — just a webhook URL generated from channel settings.

## Install

```bash
pnpm add -D @theholocron/holocron-plugin-discord
```

## Capabilities

| Capability      | Token required                             |
| --------------- | ------------------------------------------ |
| `notifications` | `HOLOCRON_DISCORD_WEBHOOK` (`discord`)     |

The "token" for Discord is the full webhook URL, not a separate API key.

## Config

```ts
providers: {
  notifications: ["discord", {
    // Named aliases — map logical names to webhook URLs
    webhooks: {
      deploys: "https://discord.com/api/webhooks/111/abc",
      alerts:  "https://discord.com/api/webhooks/222/xyz",
    },
    // Default when send() is called without an explicit channel
    defaultChannel: "deploys",
  }],
}
```

### Options

| Option           | Required | Description                                                                                 |
| ---------------- | -------- | ------------------------------------------------------------------------------------------- |
| `webhooks`       | No       | Named aliases mapping logical channel names to their webhook URLs                           |
| `defaultChannel` | No       | Alias key or raw webhook URL used as the fallback when no channel is passed to `send()`     |

## Authentication

The "token" for Discord is an **incoming webhook URL** — it contains the credential inline and requires no Authorization header.

### 1. Create a webhook

1. Open your Discord server and navigate to the channel you want to post to
2. Click the gear icon (**Edit Channel**) → **Integrations** → **Webhooks**
3. Click **New Webhook**, give it a name (e.g. "Holocron"), and click **Copy Webhook URL**

The URL looks like: `https://discord.com/api/webhooks/{webhook.id}/{webhook.token}`

### 2. Store the webhook URL

```bash
holocron auth set discord https://discord.com/api/webhooks/1234567890/abcdefghij...
```

Or via env var:

```bash
export HOLOCRON_DISCORD_WEBHOOK=https://discord.com/api/webhooks/...
# Also recognized:
export DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...
```

:::caution
Treat the webhook URL as a secret — anyone with it can post to your channel.
:::

## What `notifications` provides

- `send(channel, message)` — post a message to the given channel. `channel` can be:
  - A key in `webhooks` (alias)
  - A raw webhook URL (`https://discord.com/api/webhooks/...`)
  - An empty string, which falls back to `defaultChannel`

## Example

```ts
import { createPlugin } from "@theholocron/holocron-plugin-discord";

const plugin = createPlugin({
  cliToken: process.env.HOLOCRON_DISCORD_WEBHOOK,
  webhooks: {
    deploys: "https://discord.com/api/webhooks/111/abc",
  },
  defaultChannel: "deploys",
});
const notif = plugin.capabilities.notifications();

// Via alias
await notif.send("deploys", "Deploy complete");
// Via raw URL
await notif.send("https://discord.com/api/webhooks/111/abc", "Deploy complete");
// Via default
await notif.send("", "Deploy complete");
```
