# `@theholocron/holocron-plugin-turbo`

Turbo plugin for [Holocron](../cli). Implements the `cache` capability for
[Turborepo's Remote Cache](https://turborepo.com/docs/core-concepts/remote-caching), which Vercel serves.

## Install

```bash
pnpm add -D @theholocron/holocron-plugin-turbo@alpha
```

## Auth

The token is a Vercel token. Resolution order:

1. `--token <TOKEN>` flag on the holocron invocation
2. `HOLOCRON_TURBO_TOKEN` env var
3. `TURBO_TOKEN` env var (the one Turborepo reads)
4. Keyring `turbo`, set via `holocron new token turbo <token>`

The team is `HOLOCRON_TURBO_TEAM`, then `TURBO_TEAM` (a team slug, or a `team_...` id). It is not a secret.

## Config

```ts
providers: {
  cache: "turbo",
}
```

The organization's `holocron_capabilities` property must allow `cache` (`holocron apply properties`) before a repo
declares it.

## What it checks

`cache.checkToken()` and `holocron probe turbo token` ask Vercel's `GET /v8/artifacts/status` for the team and report
whether the token is accepted and the cache answers. Vercel does not report a token's scope, so permissions are not
checked. See the [docs page](https://docs.theholocron.dev/holocron/plugins/turbo/).
