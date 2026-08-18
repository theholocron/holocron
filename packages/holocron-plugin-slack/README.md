<!-- editorconfig-checker-disable-file -->

# `@theholocron/holocron-plugin-slack`

Slack plugin for [Holocron](../cli). Implements the `notifications`
capability via the [Slack Web API](https://api.slack.com/web).

## Install

<!-- prettier-ignore -->
```bash
pnpm add -D @theholocron/holocron-plugin-slack

```

## Auth

Token resolution order:

1. `--token <TOKEN>` flag on the holocron invocation
2. `HOLOCRON_SLACK_TOKEN` env var
3. `SLACK_BOT_TOKEN` env var (the standard Slack variable name)

Create a Slack app at **api.slack.com/apps**, add the `chat:write` bot
scope, install it to your workspace, and copy the **Bot User OAuth Token**
(`xoxb-…`). The bot must be invited to any channel it will post to
(`/invite @YourBotName`).

## Config

<!-- prettier-ignore -->
```jsonc
{
  "providers": {
    "notifications": ["slack", { "defaultChannel": "C0123456789" }],
  },
}

```

- `defaultChannel` (optional) — Slack channel id used when `send()` is
  called with an empty string.

## What's implemented

| Method | What it does                                                                                                                         |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| `send` | Posts a plain-text message to the given channel id via `chat.postMessage`. Falls back to `defaultChannel` when `channel` is empty. |

Slack always returns HTTP 200 with an `ok` field — errors are surfaced as
`ProviderApiError` from the response body rather than from the HTTP status.
