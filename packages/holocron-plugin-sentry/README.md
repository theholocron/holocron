<!-- editorconfig-checker-disable-file -->

# `@theholocron/holocron-plugin-sentry`

Sentry plugin for [Holocron](../cli). Implements the `observability`
capability against the [Sentry management API](https://docs.sentry.io/api/).

## Install

<!-- prettier-ignore -->
```bash
pnpm add -D @theholocron/holocron-plugin-sentry

```

## Auth

Token resolution order:

1. `--token <TOKEN>` flag on the holocron invocation
2. `HOLOCRON_SENTRY_TOKEN` env var
3. `SENTRY_AUTH_TOKEN` env var (the standard Sentry variable name)

Generate an auth token at **sentry.io/settings/account/api/auth-tokens/**
with `org:read`, `project:read`, and `project:write` scopes. Both
user-owned and org-owned tokens are accepted.

## Config

<!-- prettier-ignore -->
```jsonc
{
  "providers": {
    "observability": ["sentry", { "org": "my-org-slug", "team": "my-team" }],
  },
}

```

- `org` (required) — Sentry organization slug.
- `team` (optional) — team slug for project creation. Defaults to the
  org slug when omitted.

## What's implemented

| Method          | What it does                                                                                                                                                 |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `describe`      | Returns `{ provider: "sentry", envKeys: ["SENTRY_DSN", "NEXT_PUBLIC_SENTRY_DSN"] }` — the env vars the app reads at runtime.                                 |
| `whoami`        | Fetches the org by slug to verify the token and confirm the org exists.                                                                                      |
| `ensureProject` | Looks up the project by slug (derived from `name`); creates it under the configured team if absent. Returns the DSN and an `alreadyExists` flag. Idempotent. |

`holocron setup` calls `ensureProject` and pushes both `SENTRY_DSN` and
`NEXT_PUBLIC_SENTRY_DSN` to GitHub Secrets (same DSN value, both keys
required by the Sentry Next.js SDK).
