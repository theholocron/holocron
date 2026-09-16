---
status: draft
issue: theholocron/holocron#679
blocked-by: []
related:
  - theholocron/holocron#672
  - theholocron/holocron#674
  - theholocron/holocron#675
  - theholocron/holocron#677
---

# Sentinel — minimal GitHub App v1

Workstream spec under the [Holocron Platform epic](https://github.com/theholocron/holocron/issues/672)
(`.notes/tech-holocron-platform.spec.md`). Covers D2, D4, D6, D8, D10 and the
"Phase B" section of that spec in full detail.

**Sentinel** is this project's name for the package — a sentinel droid
watches, validates, and reports, never acting on its own, which is exactly
what this App does (v1 scope, below). "GitHub App" stays as GitHub's own
platform term for the underlying integration type; it isn't renamed,
just the thing we're building on top of it.

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

## Resolved

- **Package location: `packages/sentinel`, published as
  `@theholocron/sentinel`.** Matches the naming precedent for
  core-platform packages — `astromech`, `datapad`, `cli`, `logger` all
  publish as `@theholocron/<name>`, no prefix (unlike vendor plugins,
  `@theholocron/holocron-plugin-<provider>`). This package isn't a vendor
  integration; it's Holocron's own runtime. Carries its own
  `holocron.config.ts` (dogfooding, as originally noted) — wires whatever
  `vault` provider the org already uses (1Password/Doppler/Infisical) for
  its own secrets, same as every other package in this repo.
- **Secrets: the existing `vault` capability, not a new path.** The App's
  GitHub App private key + webhook secret are this package's own deployment
  secrets — the same shape as any other `holocron-plugin-*` package's
  vendor token today. `holocron secrets sync` already pushes vault-held
  values to a deploy target's env vars (Vercel) or platform secrets
  (Cloudflare Workers) — whichever deploy target below ends up hosting this,
  the mechanism is already built, not new work. No new secrets
  infrastructure needed; this was never actually an open question once
  framed as "this package's own secrets," not "a special App-only path."

## Open, not yet decided

- **Deploy target** for the App's webhook receiver. Candidates already
  integrated elsewhere in this org: Vercel (`holocron-plugin-vercel` already
  exists) or Cloudflare Workers (`holocron-plugin-cloudflare` already
  exists). Neither existing capability directly models "deploy a general
  webhook handler" today — `Deployment` (Vercel) models a framework-aware
  project; `Workers` (Cloudflare) is currently scoped narrowly to
  reverse-proxying the wiki, not general Worker deployment — so either
  choice means extending a capability, not just calling one. Deliberately
  left open rather than decided here; revisit once the webhook
  receiver's actual shape (framework, if any) is clearer from scaffolding
  the package itself.

## Dependencies

- Vocabulary + registry rename (#675) — **shipped**, merged to alpha across
  #683–#686. The App validates against the renamed schema.
- Custom-properties sync expansion (#677) — **shipped**, merged to alpha via
  #714/#716 (the second PR fixed a real `multi_select`/length-limit bug the
  first one's design missed — see `.notes/tech-holocron-platform.spec.md`'s
  "Custom-properties sync — field definitions" section). The App extends
  this mechanism rather than building its own.

## PR-stack

- [x] Scaffold `packages/sentinel` (`@theholocron/sentinel`): package.json,
      tsconfig, empty webhook-receiver entry point — no deploy target wired
      yet, just the package existing and typechecking/building in the
      workspace (#718). Its own `holocron.config.ts` deferred to the deploy
      wiring step below — premature to wire a `vault`/`deployment` provider
      before the deploy target is chosen.
- [x] Schema validation: `validateConfig()` fetches `holocron.config.*`
      (TS-first probe order, matching `datapad`) via `client.git.getContents()`
      — which takes no `ref`, so it structurally can't read anything but the
      default branch (D4/D6) — writes it into a temp dir _inside this
      package_ (so `import { defineConfig } from "@theholocron/cli"`, the
      README's own documented config pattern, actually resolves), and loads
      it through `@theholocron/datapad`'s `loadConfigFromContent()` (D8 —
      the same `loadFile` internals `loadConfigFile()` uses locally for
      `holocron setup`/`sync`; extracted into datapad rather than
      reimplemented here, since "load config from content that isn't a file
      on disk yet" is Holocron-agnostic the same way "load config from a
      file" already is — datapad's own charter, not something specific to
      Sentinel's GitHub-fetch). Validates the resulting `tasks` array
      against `astromech`'s `KNOWN_TASKS` (D11 — one canonical table,
      imported not copied).
- [x] Webhook receiver: `parseWebhookEvent()` normalizes `installation`
      (created/deleted), `push` (default-branch only), and `pull_request`
      (opened/synchronize) deliveries into a `SentinelEvent`. Handler logic
      only — a plain function over `{ body, headers, secret }`, no HTTP
      framework, so it's unaffected by the deploy-target decision below.
      Anything outside v1 scope (other installation actions,
      non-default-branch pushes, other PR actions, other event categories)
      comes back `{ handled: false }` rather than throwing — a
      validly-signed but out-of-scope delivery isn't an error.
      Verification itself (`X-Hub-Signature-256`, HMAC-SHA256,
      `timingSafeEqual`) and the header/payload shapes moved to
      `@theholocron/github-client`'s `verifyGitHubWebhookSignature()` /
      `parseGitHubWebhookHeaders()` / `GitHub*WebhookPayload` (`clients`
      repo, published 1.18.0) — GitHub's own webhook mechanics belong with
      the package that already owns every other GitHub API shape, not
      reimplemented per-consumer. Checked against `holocron-plugin-clerk`'s
      Svix verification as the nearest precedent first: that one bundles
      verification _and_ Clerk-specific `AuthEvent` normalization together
      in the plugin, a fundamentally different split (Svix's message-to-
      sign construction, key-rotation-aware multi-signature checking, and
      replay-window enforcement are real per-vendor logic that wouldn't
      compress into one shared abstraction with GitHub's flatter
      single-signature scheme) — so only the mechanically-identical half
      (verify + header shapes) moved, and only because `github-client` was
      already a Sentinel dependency, not as a new speculative package built
      for hypothetical future GitHub Apps.
- [ ] Custom-properties sync call: invoke the existing `syncProperties()`
      path (#677/#716) from the webhook handler on a push-to-default-branch
      event.
- [ ] Check-run posting: one check run per resolution run, reflecting
      capability-compliance status.
- [ ] Deploy-target decision + actual deploy wiring — blocked on the open
      question above.
