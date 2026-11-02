---
id: SPEC-0044
status: accepted
issue: theholocron/holocron#996
blocked-by: []
related:
  - theholocron/holocron#997
  - theholocron/holocron#998
  - theholocron/clients#393
  - theholocron/clients#394
---

# Checkly + Sourcery adoption

Practical implementation details for the two devtool decisions covered
by [ADR-0013](../decisions/0013-checkly-monitoring-holocron-plugin.md)
(Checkly) and [ADR-0014](../decisions/0014-sourcery-github-app-no-plugin.md)
(Sourcery). The ADRs carry the "why"; this spec carries the "how it's
actually wired."

## Checkly — uptime monitoring

### What it watches

One API check: `GET https://sentinel.theholocron.dev/api/webhook`,
asserting a `405` status code. Confirmed live that
`handleWebhookRequest` declines non-POST requests before touching any
webhook-specific logic — a clean 405 proves the function is deployed
and routing correctly (not crashed, cold, or timed out). Full
business-logic correctness is covered by Sentinel's own test suite;
this check is reachability only.

### Packages

- **`@theholocron/checkly-client`** (`theholocron/clients`, PR #394,
  published as `1.40.0`) — typed REST client. Covers
  `checks.list/get/create/update/delete` against Checkly's API-check
  endpoints only; browser checks, heartbeats, and dashboards are out
  of scope until a real consumer needs them.
- **`@theholocron/holocron-plugin-checkly`** (`plugins/holocron-plugin-checkly`)
  — implements the new `monitoring` capability. Initially shipped with
  its own inline `createRestClient`-based wrapper (`src/rest.ts`)
  rather than depending on `checkly-client` directly — the two-phase
  plugin pattern (ship with an inline wrapper, migrate once the typed
  client publishes) avoided blocking the plugin on a cross-repo npm
  publish that needed a human's 2FA for the first release. Now that
  `1.40.0` is published, `src/rest.ts` is a pure re-export barrel from
  `@theholocron/checkly-client` — `src/capabilities/monitoring.ts`
  calls the typed `client.checks.list/create/update` methods directly
  instead of raw `.request()` calls.

  Migrating surfaced a real bug: `@theholocron/checkly-client`'s own
  dependency on `@theholocron/http-client@^1.40.0` was stricter than
  this workspace's exact-pinned `overrides.@theholocron/http-client`
  (`1.39.0`), so pnpm resolved a **second** physical `http-client`
  instance for it — the same `instanceof ProviderApiError` dual-module
  hazard `pnpm-workspace.yaml`'s own override comment warns about, this
  time triggered by a new client's publish rather than a version bump
  of an existing one. Fixed by bumping the override (and the
  `catalog:clients` entry) to `1.40.0`.

### The `monitoring` capability

Added to `packages/cli/src/plugin/capabilities.ts`, vendor-neutral so
a future Datadog/Pingdom/UptimeRobot provider can implement the same
shape:

```ts
type MonitoringAssertionSource = "status_code" | "response_time" | "body" | "header";
type MonitoringAssertionComparison =
  "equals" | "not_equals" | "contains" | "not_contains" | "greater_than" | "less_than";

interface MonitoringCheckInput {
  name: string; // also the idempotency key
  url: string;
  method?: MonitoringHttpMethod;
  frequency?: number;
  activated?: boolean;
  assertions?: MonitoringAssertion[];
}

interface Monitoring {
  readonly key: "monitoring";
  readonly checks: readonly MonitoringCheckInput[]; // from the provider config tuple
  whoami?(): Promise<{ ok: boolean }>;
  ensureCheck(input: MonitoringCheckInput): Promise<{ check: MonitoringCheck; alreadyExists: boolean }>;
}
```

`checks` is populated from the provider config tuple's second
argument — the same place `Deployment.domain` comes from — not passed
as a method argument the generic orchestrator has to source from
elsewhere.

Wired into two existing generic loops, no new orchestration machinery:

- `holocron doctor` — if the provider's `whoami()` is defined, calls it
  and reports ok/fail; otherwise reports skip (no smoke check defined).
- `holocron repo setup` — loops `monitoring.checks`, calling
  `ensureCheck()` for each and printing created/exists.

### Checkly-side implementation (`holocron-plugin-checkly`)

- **`ensureCheck`** — Checkly has no separate idempotency key, so this
  is find-then-create-or-update by exact `name`: list checks with
  Checkly's `search` query param (a case-insensitive **partial** match)
  to narrow candidates, then filter client-side for an exact match.
  Match found → `PUT /checks/api/{id}`. No match → `POST /checks/api`.
- **`whoami`** — lightweight auth probe: `GET /checks?limit=1`.
- **`verifyToken`** (used by `holocron auth set`/`check`, before any
  `accountId` is in scope) — `GET /accounts`, the one Checkly endpoint
  confirmed (via the live OpenAPI spec) **not** to require the
  `x-checkly-account` header every other endpoint needs. Lists every
  account the key can see.
- **Vendor-neutral → Checkly enum translation** —
  `SOURCE_MAP`/`COMPARISON_MAP` in `src/capabilities/monitoring.ts`
  translate the capability's lowercase enums (`status_code`, `equals`)
  to Checkly's own uppercase ones (`STATUS_CODE`, `EQUALS`) — the
  vendor-specific shape never leaks into the shared `Monitoring`
  interface.

### Auth

Standard 4-step precedence (`createResolveToken`), same as every other
plugin:

1. `--token <TOKEN>`
2. `HOLOCRON_CHECKLY_TOKEN` (explicit Holocron-side name)
3. `CHECKLY_API_KEY` (Checkly's own native env var name — matches what
   Checkly's own CLI reads, confirmed against the now-removed
   `checkly.config.ts`-based workflow)
4. OS keyring (`com.theholocron.cli` service, account `checkly`)

**Token type: regular User API key, not Service API key.** Service
API keys are account-scoped and survive personnel changes, but require
the Starter tier or above — not available on the free Hobby tier this
account starts on. Revisit once/if the account upgrades.

**Secret storage: Doppler.** Same `sentinel`/`prd` project every other
Sentinel secret lives in — no new vault. `holocron secrets sync` fans
`CHECKLY_API_KEY` out from there same as the other 5 Sentinel keys.

### Config

```ts
// apps/sentinel/holocron.config.ts
providers: {
	monitoring: [
		"checkly",
		{
			accountId: "fb82859a-4f62-4773-8404-db0f29f9262c", // not a secret — same status as Vercel's teamId
			checks: [
				{
					name: "Sentinel webhook uptime",
					url: "https://sentinel.theholocron.dev/api/webhook",
					method: "GET",
					// Required, not optional — Checkly rejects a check with
					// neither locations nor privateLocations set (confirmed
					// live: 400 "You have to set at least one location or
					// privateLocation" on this trial account's first real
					// holocron repo setup run).
					locations: ["us-east-1"],
					// 405 is the EXPECTED healthy response — without shouldFail,
					// Checkly classifies any >=400 response as a platform-level
					// failure before assertions are evaluated (confirmed live:
					// hasFailures: true with the assertion matching exactly).
					shouldFail: true,
					assertions: [{ source: "status_code", comparison: "equals", target: "405" }],
				},
			],
		},
	],
	// …deployment, dns, secrets, vault unchanged
},
```

### What's left (tracked in #996)

1. ~~Sign up for Checkly's free Hobby tier.~~ Done.
2. ~~Generate a regular User API key.~~ Done.
3. ~~Fill in the real `accountId` above.~~ Done.
4. ~~Set the key locally via `holocron auth set checkly <KEY>` (OS
   keyring).~~ Done — `holocron auth check checkly` verifies against
   `GET /accounts`. **Not a Doppler candidate**: unlike the 5 genuine
   runtime secrets in `sentinel`/`prd` (`GITHUB_APP_ID`,
   `GITHUB_APP_PRIVATE_KEY`, `SENTINEL_WEBHOOK_SECRET`,
   `SENTINEL_AXIOM_INGEST_TOKEN`, `AXIOM_DATASET` — read by the
   deployed Vercel function itself and fanned out by `holocron
secrets sync`), the Checkly key is a provisioning-time credential
   used only by the `holocron` CLI (`repo setup`/`doctor`), never by
   the deployed function. OS keychain is the right (and final) home
   for it — same pattern as the Vercel and Cloudflare tokens, neither
   of which live in Doppler either.
5. ~~`holocron repo setup --cwd apps/sentinel` to provision the
   check.~~ Done, after two real-world fixes (see ADR-0013):
   - First attempt failed — `POST /checks/api → 400` (missing
     `locations`) — fixed by adding `locations: ["us-east-1"]`.
   - Check created, but every run reported `hasFailures: true` despite
     the status-code assertion matching exactly (`actual: 405` ===
     `target: "405"`) — Checkly classifies any >=400 response as a
     platform-level failure before assertions are evaluated at all.
     Fixed by adding `shouldFail: true` (`theholocron/clients#395`,
     published as `@theholocron/checkly-client@1.41.0`) — immediately
     unblocked live via a direct `PUT` on the existing check, then
     fixed properly in the plugin for future `holocron repo setup`
     runs.
   - ~~Confirm the check now passes in the Checkly dashboard after the
     next scheduled (or manually triggered) run.~~ Done — first passing
     run confirmed live after `holocron repo setup` pushed the
     `shouldFail` update.
6. ~~Add a second check covering signature verification, not only
   reachability.~~ Done — a POST with no signature header, asserting
   401 (`handler.ts`'s `parseWebhookEvent()` always rejects an
   unsigned request). This is the only check that actually proves
   `SENTINEL_WEBHOOK_SECRET` is correctly wired end-to-end in the
   deployed environment — the uptime check's 405 fires before
   signature verification ever runs. Needed `body` support on
   `ApiCheckRequest` (`theholocron/clients#396`, published as
   `@theholocron/checkly-client@1.42.0`) since Checkly has no API
   check without a request to send. Also added a `body`-source
   assertion to the existing uptime check (catches a regression where
   the status stays 405 but the response text itself changes).

### Scaffold-template fix (side effect)

Building this plugin surfaced a pre-existing bug in
`holocron new plugin`'s own template
(`packages/cli/src/commands/plugin-create/templates/plugin-index.ts`):
the generated `src/index.ts` re-exported
`VerifyTokenSuccess`/`VerifyTokenFailure` from the plugin's own
`verify-token.ts`, but those types live in `@theholocron/cli` — no
scaffolded plugin ever defined them locally. Fixed at the template
source, so every future `holocron new plugin` invocation is unaffected,
not only this one.

## Sourcery — AI PR review

### What it does

GitHub App that posts an automated first-pass review on opened PRs —
catches the mechanical issues (style, plain bugs, missed edge cases)
before a human or a general-purpose agent spends tokens on them.

### Setup (manual, one-time — no holocron code)

1. Install the app: <https://github.com/apps/sourcery-ai>
2. Grant access to the repos that should get automated review.
3. Confirm Sourcery posts a review on the next opened PR in each repo.

No plugin, no capability, no CI workflow change — see ADR-0014 for why
this is structurally different from Checkly: the entire integration
surface **is** the GitHub App install, not an API a capability would
call.

### What's left (tracked in #998)

Confirm the install is live and reviewing PRs across the intended
repos.
