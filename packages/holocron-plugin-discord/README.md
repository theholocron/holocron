<!-- editorconfig-checker-disable-file -->

# `@theholocron/holocron-plugin-discord`

Discord plugin for [Holocron](../cli). Implements the `notifications`
capability via [Discord incoming webhooks](https://discord.com/developers/docs/resources/webhook).

## Install

<!-- prettier-ignore -->
```bash
pnpm add -D @theholocron/holocron-plugin-discord

```

## Auth

Token resolution order:

1. `--token <WEBHOOK_URL>` flag on the holocron invocation
2. `HOLOCRON_DISCORD_WEBHOOK` env var
3. `DISCORD_WEBHOOK_URL` env var

The "token" is the full incoming webhook URL
(`https://discord.com/api/webhooks/{id}/{token}`). No bot account or
server membership is required — generate one in Discord under
**channel settings → Integrations → Webhooks**.

## Config

<!-- prettier-ignore -->
```jsonc
{
  "providers": {
    "notifications": [
      "discord",
      {
        "webhooks": { "deploys": "https://discord.com/api/webhooks/…" },
        "defaultChannel": "deploys",
      },
    ],
  },
}

```

- `webhooks` (optional) — map of logical channel names to webhook URLs.
  Allows `send("deploys", msg)` instead of embedding raw URLs in call sites.
- `defaultChannel` (optional) — alias key or raw webhook URL used when
  `send()` is called with an empty string. Defaults to the resolved token
  (the webhook URL from the env var / keyring).

## What's implemented

| Method | What it does                                                                                                                                                                              |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `send` | Posts a message to the given channel. `channel` can be a named alias (from `webhooks`), a raw webhook URL, or an empty string (falls back to `defaultChannel`). Returns on `204 No Content`. |

The webhook id and token are embedded in the URL path — no `Authorization`
header is sent. `parseWebhookUrl` is exported as a utility for callers
that need to split the URL into its parts.
