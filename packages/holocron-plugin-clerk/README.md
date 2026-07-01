# `@theholocron/holocron-plugin-clerk`

Clerk plugin for [Holocron](../cli). Implements the `auth` capability
against [Clerk's Backend REST API](https://clerk.com/docs/reference/backend-api).

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

**v0.0.0 — first port.** Capability matches Rando's
`adapters/clerk-cli.ts` surface plus a holocron-native `describe()`,
all via direct REST against `api.clerk.com/v1`. No `clerk` CLI binary
required on the operator's machine.
