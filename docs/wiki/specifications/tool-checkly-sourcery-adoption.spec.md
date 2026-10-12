---
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

- **`@theholocron/checkly-client`** (`theholocron/clients`, PR #394) —
  typed REST client. Covers `checks.list/get/create/update/delete`
  against Checkly's API-check endpoints only; browser checks,
  heartbeats, and dashboards are out of scope until a real consumer
  needs them. Not yet published to npm.
- **`@theholocron/holocron-plugin-checkly`** (`plugins/holocron-plugin-checkly`)
  — implements the new `monitoring` capability. Ships with its own
  inline `createRestClient`-based wrapper (`src/rest.ts`) rather than
  depending on `checkly-client` directly — the two-phase plugin
  pattern (ship with an inline wrapper, migrate once the typed client
  publishes) avoids blocking the plugin on a cross-repo npm publish
  that needs a human's 2FA for the first release.

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
// packages/sentinel/holocron.config.ts
providers: {
	monitoring: [
		"checkly",
		{
			accountId: "<CHECKLY_ACCOUNT_ID>", // not a secret — placeholder until the account exists
			checks: [
				{
					name: "Sentinel webhook uptime",
					url: "https://sentinel.theholocron.dev/api/webhook",
					method: "GET",
					assertions: [{ source: "status_code", comparison: "equals", target: "405" }],
				},
			],
		},
	],
	// …deployment, dns, secrets, vault unchanged
},
```

### What's left (tracked in #996)

1. Sign up for Checkly's free Hobby tier.
2. Generate a regular User API key.
3. Fill in the real `accountId` above (currently a placeholder).
4. Add the key to Doppler (`sentinel`/`prd`) as `CHECKLY_API_KEY`, then
   `holocron secrets sync`.
5. `holocron repo setup --cwd packages/sentinel` to provision the
   check; confirm it's live in the Checkly dashboard.

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
