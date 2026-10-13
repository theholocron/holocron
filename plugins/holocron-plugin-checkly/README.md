<!-- editorconfig-checker-disable-file -->

# `@theholocron/holocron-plugin-checkly`

Checkly plugin for [Holocron](../cli). Implements the
`monitoring` capability against [Checkly's REST API](https://api.checklyhq.com/v1)
(API checks only — browser checks, heartbeats, and dashboards are out of
scope until a real consumer needs them), plus exports `verifyToken` +
`AUTH_HINT` for use by `holocron auth`.

## Install

```bash
pnpm add -D @theholocron/holocron-plugin-checkly@alpha
```

## Auth

Token resolution order (standard 4-step precedence, same pattern as
every other plugin):

1. `--token <TOKEN>` flag on the holocron invocation
2. `HOLOCRON_CHECKLY_TOKEN` env var (preferred — explicit intent)
3. `CHECKLY_API_KEY` env var (Checkly-native)
4. **Keyring** — `com.theholocron.cli` service, account `checkly`
5. `AuthError` naming all four options + the bootstrap hint

Use a regular **User API key** (Account settings → API keys). Checkly's
account-scoped **Service API keys** survive personnel changes and carry
granular roles, but require the Starter tier or above — not available
on the free Hobby tier. Revisit if/when the account upgrades.

```bash
holocron auth set checkly <TOKEN>
holocron auth check checkly    # verify — hits GET /v1/accounts
```

## Config

`accountId` is required on every request (Checkly's `x-checkly-account`
header) — it is not a secret, the same status as Vercel's `teamId`.
`checks` is the list of API checks `holocron repo setup` ensures exist,
each matched and upserted by exact `name`. **`locations` is required** —
Checkly rejects a check with neither `locations` nor `privateLocations`
set (`400 "You have to set at least one location or privateLocation"`)
on any account with no account-level default configured, which includes
every free Hobby/trial account:

```ts
monitoring: [
  "checkly",
  {
    accountId: "<your Checkly account id>",
    checks: [
      {
        name: "Sentinel webhook uptime",
        url: "https://sentinel.theholocron.dev/api/webhook",
        method: "GET",
        locations: ["us-east-1"],
        assertions: [{ source: "status_code", comparison: "equals", target: "405" }],
      },
    ],
  },
];
```

## What's implemented

- `monitoring.ensureCheck(input)` — find-by-exact-name (Checkly's own
  `search` query param is a case-insensitive partial match, so results
  are filtered client-side for an exact match), then create or update
  the API check accordingly.
- `monitoring.whoami()` — lightweight auth probe (`GET /checks?limit=1`).
- `monitoring.checks` — the configured check list, read by
  `holocron repo setup` to loop over `ensureCheck`.
- `verifyToken` — `GET /v1/accounts` (the one Checkly endpoint that does
  **not** require `x-checkly-account`), used by `holocron auth set` /
  `holocron auth check` before any `accountId` is in scope.

## Status

**`v2.0.0-alpha.1`** — `src/rest.ts` re-exports `@theholocron/checkly-client`
directly (two-phase plugin pattern, see `.claude/skills/holocron-skill-plugin/`
— shipped with an inline wrapper first, migrated once the typed client
published).
