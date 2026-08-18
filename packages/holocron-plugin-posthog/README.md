<!-- editorconfig-checker-disable-file -->

# `@theholocron/holocron-plugin-posthog`

PostHog plugin for [Holocron](../cli). Implements the `analytics`
capability against the [PostHog API](https://posthog.com/docs/api) —
project provisioning and tracking token retrieval.

## Install

<!-- prettier-ignore -->
```bash
pnpm add -D @theholocron/holocron-plugin-posthog

```

## Auth

Token resolution order:

1. `--token <KEY>` flag on the holocron invocation
2. `HOLOCRON_POSTHOG_TOKEN` env var
3. `POSTHOG_PERSONAL_API_KEY` env var
4. Keyring `posthog.<org>` — tried first when an org is active via `--org`, `HOLOCRON_ORG`, or `org` in `holocron.config.ts`
5. Keyring `posthog` — unnamespaced fallback; set via `holocron auth set posthog <phx_key>`

The token must be a **personal API key** (`phx_*`), found at
**app.posthog.com → Settings → User → Personal API keys**. This is
distinct from the project API key (`phc_*`) that the app embeds at
runtime — the personal key is for management only.

## Config

<!-- prettier-ignore -->
```jsonc
{
  "providers": {
    "analytics": ["posthog", { "host": "https://eu.posthog.com" }],
  },
}

```

- `host` (optional) — PostHog instance base URL. Defaults to the US
  cloud (`https://app.posthog.com`). Set to `https://eu.posthog.com`
  for EU cloud or your own URL for self-hosted instances.

## What's implemented

| Method          | What it does                                                                                                                                                                   |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `describe`      | Returns `{ provider: "posthog", envKeys: ["NEXT_PUBLIC_POSTHOG_KEY", "NEXT_PUBLIC_POSTHOG_HOST"] }` — the env vars the app reads at runtime.                                   |
| `whoami`        | Calls `/api/users/@me/` to verify the token and return the org slug.                                                                                                           |
| `ensureProject` | Lists projects and returns the existing one if found by name; creates it via `POST /api/projects/` otherwise. Returns the project's `api_token` (`phc_*`) and `alreadyExists`. |

`holocron setup` calls `ensureProject` and pushes `NEXT_PUBLIC_POSTHOG_KEY`
(the project `api_token`) and `NEXT_PUBLIC_POSTHOG_HOST` (the resolved
`host` value) to GitHub Secrets.
