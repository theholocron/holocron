# `@theholocron/holocron-plugin-clerk`

Clerk plugin for [Holocron](../cli). Implements the `auth` capability
against [Clerk's Backend REST API](https://clerk.com/docs/reference/backend-api).

## Install

<!-- prettier-ignore -->
```bash
pnpm add -D @theholocron/holocron-plugin-clerk@alpha

```

## Auth

Token resolution order:

1. `--token <KEY>` flag on the holocron invocation
2. `HOLOCRON_CLERK_SECRET_KEY` env var
3. `CLERK_SECRET_KEY` env var (Clerk's own default; what their docs reference)

> **Why not the `clerk` CLI?** Rando's adapter shells out to `npx clerk@latest
api …`, but the `clerk` CLI just wraps the same REST API holocron talks to.
> Direct REST drops a system-binary dependency and matches the uniform auth/REST
> pattern across the other holocron plugins.

## Config

<!-- prettier-ignore -->
```jsonc
{
  "providers": {
    "auth": "clerk",
  },
}

```

No plugin-level options today. Per-instance scoping (Development vs.
Production) is driven by which secret key the env var holds — `sk_test_*`
for Development, `sk_live_*` for Production.

## What's implemented

| Method                   | What it does                                                                |
| ------------------------ | --------------------------------------------------------------------------- |
| `describe`               | Declares `CLERK_PUBLISHABLE_KEY` + `CLERK_SECRET_KEY` as runtime envs       |
| `whoami`                 | `GET /users/count` reachability probe (returns user count)                  |
| `ensureWebhookApp`       | `POST /webhooks/svix` — idempotent; already-exists → `{alreadyExists:true}` |
| `getWebhookDashboardUrl` | `POST /webhooks/svix_url` — deep-link to Svix dashboard                     |
| `createUser`             | `POST /users` — seeds users (test fixtures, admin bootstrap)                |

## Status

**`v2.0.0-alpha.0`** — published on npm under the `alpha` dist-tag.
[Release notes](https://github.com/theholocron/holocron/releases/tag/v2.0.0-alpha.0).
APIs may still shift before stable v2.0.0.

Real Svix HMAC verification in `parseWebhook` is deferred to
[#80](https://github.com/theholocron/holocron/issues/80) — current
implementation validates shape only.
