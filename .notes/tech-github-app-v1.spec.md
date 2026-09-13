---
status: draft
issue: theholocron/holocron#679
blocked-by:
  - theholocron/holocron#675
  - theholocron/holocron#677
related:
  - theholocron/holocron#672
  - theholocron/holocron#674
---

# Minimal GitHub App v1

Workstream spec under the [Holocron Platform epic](https://github.com/theholocron/holocron/issues/672)
(`.notes/tech-holocron-platform.spec.md`). Covers D2, D4, D6, D8, D10 and the
"Phase B" section of that spec in full detail.

## Scope — in for v1

- Webhook receiver (installation events, push to default branch, PR
  opened/synchronize).
- Read `holocron.config.ts` from the default branch only (D6); validate
  against a versioned schema (D4).
- Sync resolved capabilities/profile to GitHub custom properties (D5),
  extending the existing `repo.properties` mechanism (built in #677, a
  dependency of this workstream).
- Post a single check run reflecting capability-compliance status (e.g.,
  "this repo declares X, Y, Z — all present" / "missing: dependencyReview").

## Explicitly out of v1

The App autonomously **triggering** autofix PRs or PR comments on webhook
events, and dashboards. This does not remove anything that exists today —
`holocron sync-github --pr` already opens autofix PRs (the CLI-driven
mechanism used for the fleet-wide fixes this org has already shipped), and
`Issues.comment()` already exists as a capability primitive
(`packages/holocron-plugin-github/src/capabilities/issues.ts`), just not
wired into a live workflow yet. What's deferred is the App deciding **on its
own, from a webhook event**, to invoke either — not the underlying
capability. Full list, kept as one running backlog: #674.

## Hard constraints carried from the epic spec

- **D4/D6 — security boundary.** The App only ever reads
  `holocron.config.ts` from a repo's default branch — never a PR branch or
  fork. Config stays plain serializable data (no functions, no
  side-effecting dynamic imports); `defineConfig()` is an
  identity/validation function, not an execution hook. A PR changing
  `holocron.config.ts` takes effect on merge — same trust model as
  CODEOWNERS or workflow files, no new trust boundary introduced.
- **D8 — one engine, three callers.** Whatever the App decides to check must
  invoke the exact same `holocron run`/`holocron ci` resolution path a
  developer or CI job uses — never a bespoke server-side-only
  implementation.
- **D10 — org-portable by construction.** Nothing hardcodes
  `"theholocron"` — the App is installable across multiple orgs/accounts by
  design (one App registration, N installations), using the same
  `orgContext` pattern `astromech` already uses (tested against a fake
  `"acme"` org, not hardcoded).

## Open, not yet decided

- **Deploy target** for the App's webhook receiver. Candidates already
  integrated elsewhere in this org: Vercel (`holocron-plugin-vercel` already
  exists) or Cloudflare Workers (`holocron-plugin-cloudflare` already
  exists). Resolve as part of this spec once Phase A's vocabulary +
  properties work has landed and the App's actual shape is clearer — not a
  separate issue.
- Package location within the monorepo (`packages/github-app`? something
  else?) and its own `holocron.config.ts` (dogfooding).
- Whether the App needs a GitHub App private key + webhook secret stored via
  the existing vault capability, or a new secrets path.

## Dependencies

- Vocabulary + registry rename (#675) — the App validates against the
  renamed schema, not the pre-rename one.
- Custom-properties sync expansion (#677) — the App extends this mechanism
  rather than building its own.

## PR-stack

TBD — filed once the deploy-target decision and package location are
resolved.
