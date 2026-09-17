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

## Resolved — deploy target: Vercel Functions (reversed from Cloudflare Workers)

**Originally chosen: Cloudflare Workers**, for cold-start fit against
GitHub's ~10s webhook delivery window. Built out: Cloudflare Workers
secret-binding support (`clients` repo, #342), GitHub App authentication
(`clients` repo, #343 — Web Crypto only, so it'd run unchanged on
Workers or Node either way), and a `Workers.deployScript()` capability
extension (`packages/cli` + `holocron-plugin-cloudflare`, #729) for
deploying an arbitrary script, not just the existing wiki reverse-proxy.

**Reversed once `packages/sentinel/src/handler.ts` actually got built**,
targeting the real blocker: `validateConfig()` fetches a repo's
`holocron.config.*` and executes it as a real module — including
`import { defineConfig } from "@theholocron/cli"`, its own documented
pattern — by writing the content to a temp file and dynamically
`import()`-ing that path (D8: reuses `@theholocron/datapad`'s
`loadFile` internals unchanged, not a bespoke parser). That needs a
real, writable filesystem and real dynamic `import()` of freshly-written
content. Cloudflare Workers' V8-isolate model has neither — not even
with the `nodejs_compat` flag, which polyfills API shapes (`Buffer`,
`process`, parts of `node:crypto`) but not a virtual disk. This wasn't
visible in the original comparison, which weighed cold-start and which
crypto API to use, not whether config-loading's execution model works on
the target at all — a real gap in that evaluation, not a config flag
away from fixed.

Vercel Functions run on a real Node.js runtime with a genuinely writable
`/tmp` and full dynamic `import()` — `validateConfig()` runs completely
unchanged there. `handler.ts` itself needed no logic changes either: it
was already a plain, deploy-target-agnostic `(Request, Env) => Response`
function (`handleWebhookRequest`), not a Cloudflare-specific `{ fetch }`
module-worker export.

**The Cloudflare Workers infrastructure already shipped isn't wasted** —
`deployScript()`, the secrets support, and the `putScript`/`cfRequest`
duplication cleanup #729 also did are legitimate, general-purpose
capability surface for `holocron-plugin-cloudflare` regardless of
Sentinel's own deploy target (the wiki proxy already used the module;
future work — this org's or `rando`'s — can use `deployScript()` for any
other Worker). It's just not what Sentinel itself deploys through.

**Vercel's `Deployment` capability needs the same shape of extension**
`Workers` just got — it currently models a framework-aware project
(docs/app deployments), not "deploy one serverless function." Not yet
started; tracked as its own PR-stack item below, mirroring the Workers
work rather than repeating its research from scratch.

One piece discovered mid-flight, independent of the deploy-target
reversal: the handler needs an installation-scoped `GitHubClient`, not a
static PAT — a **GitHub App authentication** module (`clients` repo,
#343, alongside the webhook-verification and Checks API work already
there) had to exist first. See the PR-stack below for what actually
shipped, in what order.

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
- [x] Custom-properties sync call: `syncPropertiesFromConfig()` resolves
      the same 10 fields `holocron sync`'s `properties` step computes and
      calls `client.properties.setProperties()` (#677/#716's mechanism)
      directly — not through `@theholocron/holocron-plugin-github`'s
      `syncProperties()` capability wrapper, since Sentinel isn't a plugin
      and already depends on `@theholocron/github-client` directly; the
      wrapper is a one-line pass-through with nothing else to reuse. D8
      satisfied by importing the derivation functions
      (`deriveProfile`/`deriveStack`/`deriveCapabilities`/`deriveCompliance`,
      newly exported from `@theholocron/cli`'s public entry point)
      unchanged — only their inputs are gathered differently (a recursive
      `git.getTree()` walk for workspace `package.json` files instead of a
      local `readdir`), inherent to running from a webhook with no
      checkout. Not yet wired to an actual webhook handler — that's the
      deploy-target-wiring item below; this is the same "ready to be
      called once a handler exists" shape `validateConfig()` and
      `parseWebhookEvent()` already have.
- [x] Check-run posting: `postCheckRun()` posts one check run per
      resolution run via `@theholocron/github-client`'s newly-added
      `checks.createCheckRun()` (`clients` repo, published 1.19.0) —
      Sentinel calls it directly rather than through a wrapper, since
      it's a single REST call with nothing else to reuse. Reports exactly
      the epic spec's own examples: "this repo declares X, Y, Z — all
      present" (success) or "missing: Y" (failure). D8: "missing" comes
      from a new `missingCapabilities()` sibling to `@theholocron/cli`'s
      `deriveCompliance()` — same `REQUIRED_BASELINE` table, returning
      which entries are absent rather than just whether any are, so _why_
      can never drift from _whether_. The check's display name stays
      `"Sentinel / Capability Compliance"` (human-readable "App / Report",
      matching `CodeQL`/`Devin Review` — externally-posted checks with no
      `.github/workflows/*.yml` behind them) rather than a
      `platform.*`-style intent-vocabulary token, since that vocabulary
      (D3) names `tasks:` entries backed by a reusable CI workflow and
      this check has no workflow at all; exported as
      `SENTINEL_CHECK_RUN_NAME` so nothing hand-copies the string.
      Also reorganized `packages/sentinel/src/` into `utils/` (read-only:
      `validateConfig`, `parseWebhookEvent`, `decodeContents`,
      `findPackageRoot`) and `actions/` (writes: `syncPropertiesFromConfig`,
      `postCheckRun`) — the read/write split a future webhook handler
      will actually call in that order.
- [x] Deploy-target decision: Cloudflare Workers — see "Resolved — deploy
      target" above.
- [x] Cloudflare Workers secret-binding support (`clients` repo, #342):
      `workers.putSecret`/`listSecrets`/`deleteSecret` — one PUT call
      both stores the encrypted value and binds it as `env.<name>` in the
      Worker.
- [x] GitHub App authentication (`clients` repo, #343 — discovered mid-
      flight, not in the original decomposition: the handler can't do
      anything useful without an installation-scoped client).
      `createAppJWT`/`getInstallationAccessToken`/`createInstallationClient`
      — Web Crypto only (`globalThis.crypto`/`CryptoKey`, no
      `node:crypto`), so it runs unchanged on Workers and in Node.
      Verified end-to-end against real generated key pairs, both PEM
      formats GitHub hands out, signature checked against `node:crypto`'s
      own `verify()`.
- [x] `Workers` capability extension: `deployScript(name, config)`
      alongside the existing `upsertProxy()` (kept, not replaced — the
      wiki proxy still uses it) — an arbitrary Worker script with its own
      secrets and routes, for a consumer that isn't a reverse-proxy.
      Also refactored `CloudflareWorkers` to delegate to
      `@theholocron/cloudflare-client`'s `workers` module (via the
      injected `CloudflareClient`) instead of its own private
      `putScript`/`cfRequest` reimplementation — pre-existing duplication
      this touched anyway, eliminated rather than extended.
- [x] Deploy-target reversal: Vercel Functions, not Cloudflare Workers —
      see "Resolved — deploy target" above for why. The Cloudflare
      `deployScript()` work above stands regardless — general
      infrastructure, just not what Sentinel itself deploys through.
- [x] Sentinel's webhook-handling core (`src/handler.ts`,
      `handleWebhookRequest(request, env)`): wires `parseWebhookEvent →
validateConfig → syncPropertiesFromConfig → postCheckRun` into a
      single, deliberately platform-agnostic Fetch-API function — a
      plain `(Request, Env) => Response`, no deploy-target-specific
      wrapper, so it needed zero changes across the deploy-target
      reversal. `installation.*` events are acknowledged only (no
      per-installation action defined in v1); `push.default-branch` and
      `pull_request.opened`/`synchronize` run the identical pipeline
      (D8), differing only in which commit SHA the check run attaches
      to — but only when `validateConfig()` reports `"valid"`; a
      missing/broken config is acknowledged without a check run,
      deferring richer "the config itself is broken" reporting.
- [ ] `Deployment` capability extension for Vercel — the same shape of
      work `Workers.deployScript()` just did, needed because `Deployment`
      currently models a framework-aware project, not "deploy one
      serverless function." Not yet started.
- [ ] Sentinel's own `holocron.config.ts` — wires `deployment` (Vercel) + `vault` providers. Depends on the Vercel capability extension.
- [ ] GitHub App registration (manual).
- [ ] Secrets flow: `holocron secrets sync` → Vercel env vars.
