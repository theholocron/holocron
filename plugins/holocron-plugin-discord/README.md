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
4. Keyring `discord.<org>` — tried first when an org is active via `--org`, `HOLOCRON_ORG`, or `org` in `holocron.config.ts`
5. Keyring `discord` — unnamespaced fallback; set via `holocron auth set discord <webhook-url>`

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

| Method | What it does                                                                                                                                                                                 |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `send` | Posts a message to the given channel. `channel` can be a named alias (from `webhooks`), a raw webhook URL, or an empty string (falls back to `defaultChannel`). Returns on `204 No Content`. |

The webhook id and token are embedded in the URL path — no `Authorization`
header is sent. `parseWebhookUrl` is exported as a utility for callers
that need to split the URL into its parts.

## Provisioning

`holocron notifications setup` and `holocron notifications channel add` create
channels, roles and webhooks through the `notifications` capability's `ensure*`
methods. They use the **Holonet bot**, not a webhook URL:

- `HOLOCRON_DISCORD_BOT_TOKEN` (or `DISCORD_BOT_TOKEN`), or the keyring entry
  `discord.holonet` (`holocron auth set discord.holonet <token>`) — the bot token
  from the Developer Portal. Only read when a provisioning command runs, or when
  `holocron doctor` checks a provider that has a `guildId`; posting never needs it.
- `HOLOCRON_DISCORD_CLIENT_SECRET` (or `DISCORD_CLIENT_SECRET`), or the keyring entry
  `discord.holonet.secret` — the application's OAuth client secret (Developer Portal →
  OAuth2 → Reset Secret). Only `holocron notifications link` reads it, to learn which
  GitHub account a member owns; the API can neither create nor read it.
- `guildId` — the server id (not a secret), set in the provider options.
- `layout` — categories, channels (each optionally with a `webhook`) and roles.

The bot needs Manage Channels, Manage Roles, Manage Webhooks and View Channels.
Everything is idempotent (looked up by name). Discord returns a webhook's URL
only to the application that created it, so a webhook the bot did not create
cannot have its URL read back.

`baseUrl` only redirects posting. The bot token is always sent to the real
Discord API unless `unsafeBotBaseUrl: true` is also set (meant for tests that
stub the API), so a changed config cannot redirect the token to another host.
