# `@theholocron/holocron-plugin-clerk`

Clerk plugin for [Holocron](../cli). Implements the `auth` capability
against [Clerk's Backend REST API](https://clerk.com/docs/reference/backend-api).

## Auth

Token resolution order:

1. `--token <KEY>` flag on the holocron invocation
2. `HOLOCRON_CLERK_SECRET_KEY` env var
3. `CLERK_SECRET_KEY` env var (Clerk's own default; what their docs reference)

> **Why not the `clerk` CLI?** Rando's adapter shells out to `npx clerk@latest
> api …`, but the `clerk` CLI just wraps the same REST API holocron talks to.
> Direct REST drops a system-binary dependency and matches the uniform auth/REST
> pattern across the other holocron plugins.

## Config

```jsonc
{
  "providers": {
    "auth": "clerk"
  }
}
```

No plugin-level options today. Per-instance scoping (Development vs.
Production) is driven by which secret key the env var holds — `sk_test_*`
for Development, `sk_live_*` for Production.

## Status

**v0.0.0 — scaffold only.** Capability methods are stubbed
(`throw new Error('not implemented')`); real implementations land in the
next commit, ported from rando-id/rando.id's `adapters/clerk-cli.ts` and
`domain/clerk.ts`. Expected surface (subject to expanding the core `Auth`
capability interface to fit):

- `whoami` — `GET /users/count` reachability probe (returns user count)
- `ensureSvixApp` — `POST /webhooks/svix` (idempotent — already-exists → noop)
- `getSvixDashboardUrl` — `POST /webhooks/svix_url` (deep-link for endpoint config)
- `createUser` — `POST /users` (seed test users)
- `describe` — required by the holocron `Auth` interface
