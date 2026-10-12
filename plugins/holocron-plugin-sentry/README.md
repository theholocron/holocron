<!-- editorconfig-checker-disable-file -->

# `@theholocron/holocron-plugin-sentry`

Sentry plugin for [Holocron](../cli). Implements the `errors`
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
4. Keyring `sentry.<org>` — tried first when an org is active via `--org`, `HOLOCRON_ORG`, or `org` in `holocron.config.ts`
5. Keyring `sentry` — unnamespaced fallback; set via `holocron auth set sentry <token>`

Generate an auth token at **sentry.io/settings/account/api/auth-tokens/**
with `org:read`, `project:read`, and `project:write` scopes. Both
user-owned and org-owned tokens are accepted.

## Config

<!-- prettier-ignore -->
```jsonc
{
  "providers": {
    "errors": ["sentry", { "org": "my-org-slug", "team": "my-team" }],
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

A provider entry in `holocron.config` is only needed to enable `holocron
setup` provisioning (`ensureProject` + pushing `SENTRY_DSN` /
`NEXT_PUBLIC_SENTRY_DSN` to Secrets) and `holocron doctor` connectivity
checks — not for runtime error reporting, which the CLI activates directly
from `HOLOCRON_SENTRY_DSN` (fallback `SENTRY_DSN`).
