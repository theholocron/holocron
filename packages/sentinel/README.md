# `@theholocron/sentinel`

Holocron's minimal GitHub App — webhook receiver, default-branch-only
`holocron.config.ts` validation, custom-properties sync, one check run per
resolution run.

> A sentinel droid: it watches, validates, and reports — never acts on its
> own. Deploy target: Vercel Functions — see `.notes/tech-sentinel-v1.spec.md`
> (repo root)'s "Resolved — deploy target" section for why (reversed from
> an earlier Cloudflare Workers choice) and what's still open (a thin
> per-platform adapter, plus Sentinel's own `holocron.config.ts`).

## Scope (v1)

- Webhook receiver: installation events, push to default branch, PR
  opened/synchronize. **Done** — `parseWebhookEvent()`.
- Read `holocron.config.ts` from a repo's default branch only — never a PR
  branch or fork (hard security boundary, D4/D6 in the epic spec). **Done**
  — `validateConfig()`.
- Sync resolved capabilities/profile to GitHub custom properties. **Done**
  — `syncPropertiesFromConfig()`.
- Post a single check run reflecting capability-compliance status.
  **Done** — `postCheckRun()`.

Explicitly out of v1 — tracked in
[#674](https://github.com/theholocron/holocron/issues/674): the App
autonomously triggering autofix PRs or PR comments from a webhook event,
and dashboards.

## Layout

`src/utils/` — read-only: fetches, parses, verifies, never mutates GitHub
(`validateConfig`, `parseWebhookEvent`, plus their shared
`decodeContents`/`findPackageRoot`/`SENTINEL_APP_NAME` helpers).
`src/actions/` — writes: calls a GitHub API that changes repo state
(`syncPropertiesFromConfig`, `postCheckRun`). `handleWebhookRequest`
(`src/handler.ts`) is the orchestration sitting above both — utils to
decide, actions to report, never the other way around.

## `validateConfig({ client, repo })`

Fetches `holocron.config.{ts,js,mjs,cjs,json}` (TS-first probe order) from
`repo`'s default branch via `@theholocron/github-client`'s
`git.getContents()` — which takes no `ref` parameter, so it structurally
can never read a PR branch or fork — and validates its `tasks` array
against `@theholocron/astromech`'s canonical task registry. Returns one of:

| `status`          | Meaning                                                         |
| ----------------- | --------------------------------------------------------------- |
| `"valid"`         | Config loaded; every task name is in the registry.              |
| `"no-config"`     | No `holocron.config.*` in any probed extension.                 |
| `"unknown-tasks"` | Config loaded; `unknownTasks` lists names outside the registry. |
| `"load-error"`    | A `holocron.config.*` exists but couldn't be parsed/executed.   |

Execution reuses `@theholocron/datapad`'s `loadConfigFromContent()`
(fetched content, not a file already on disk — the same `loadFile`
internals `loadConfigFile()` uses locally for `holocron setup`/`sync`,
D8) — so a real
`holocron.config.ts` that does
`import { defineConfig } from "@theholocron/cli"` (the CLI README's own
documented pattern) resolves correctly; the fetched content is written to
a temp directory under this package's own tree specifically so that
upward `node_modules` resolution finds it.

## `parseWebhookEvent({ body, headers, secret })`

Verifies an inbound GitHub App webhook delivery and normalizes the payload
into a `SentinelEvent`. Verification itself — `X-Hub-Signature-256`
(HMAC-SHA256 over the raw body, `timingSafeEqual`-compared) and the
header/payload shapes — is `@theholocron/github-client`'s
`verifyGitHubWebhookSignature()` / `parseGitHubWebhookHeaders()` /
`GitHub*WebhookPayload`: GitHub's own webhook mechanics, owned by the
package that already knows every other GitHub API shape, not
reimplemented here. What's Sentinel's own concern — which event
categories matter in v1, and what a normalized `SentinelEvent` looks
like — stays in this function.

A plain function over `{ body, headers, secret }` — no HTTP framework, no
deploy target assumed, so it slots into whichever runtime
`.notes/tech-sentinel-v1.spec.md`'s still-open deploy-target decision
lands on. Throws `WebhookVerificationError` for a missing/wrong secret, a
missing/malformed signature, a missing `X-GitHub-Event` header, or a body
that isn't valid JSON. Returns one of:

| Result               | Meaning                                                                                                                                                                    |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `{ handled: true }`  | One of v1's three event categories — `event` carries the normalized `SentinelEvent`.                                                                                       |
| `{ handled: false }` | A validly-signed delivery outside v1 scope (e.g. a non-default-branch push, `pull_request.closed`, an unrelated `X-GitHub-Event`) — not an error, just not actionable yet. |

`SentinelEventType` is one of `"installation.created"`,
`"installation.deleted"`, `"push.default-branch"`,
`"pull_request.opened"`, `"pull_request.synchronize"`. `repo` and
`installationId` come entirely from the payload — never a hardcoded org
(D10) — so one App registration handles installations across any number
of orgs/accounts unchanged.

## `syncPropertiesFromConfig({ client, repo, defaultBranch, config })`

Resolves and syncs GitHub custom properties for a repo — the same 10
fields `holocron sync`'s `properties` step computes (6 manual, straight
from `holocron.config.ts`'s `repo.properties` / `repo.protection`; 4
derived — #677) — from data fetched over the GitHub API instead of a
local checkout, so it can run from a webhook delivery. Pass
`validateConfig()`'s `config` from its `"valid"` result to avoid
re-fetching the same file.

The derivation logic itself —
`deriveProfile()`/`deriveStack()`/`deriveCapabilities()`/`deriveCompliance()`
— is imported from `@theholocron/cli` unchanged (D8): the same functions
`holocron sync` calls locally. Only the _inputs_ differ: workspace-package
discovery walks the default branch's tree via `client.git.getTree()`
(recursive) instead of a local `readdir`, filtering for
`packages/*/package.json` and `apps/*/package.json`. Every read goes
through `client.git.get*()` with no `ref` parameter — the same D4/D6
default-branch-only boundary `validateConfig()` relies on.

Known limitation: GitHub truncates a tree response over ~100,000 entries
(`truncated: true`) — no repo in this org is remotely close to that size
today.

## `postCheckRun({ client, repo, headSha, capabilities })`

Posts one check run reflecting capability-compliance status — the App's
v1 report, matching the epic spec's own examples: "this repo declares X,
Y, Z — all present" (`conclusion: "success"`) or "missing:
dependencyReview" (`conclusion: "failure"`). Calls
`@theholocron/github-client`'s `checks.createCheckRun()` directly —
Sentinel isn't a plugin, and this is a single REST call with nothing else
to wrap.

`capabilities` is `syncPropertiesFromConfig()`'s result's
`holocron_capabilities` (or independently resolved). "Compliant" reduces
to `@theholocron/cli`'s `missingCapabilities(capabilities).length === 0`
— the same `REQUIRED_BASELINE` table `deriveCompliance()` already checks
against, imported rather than duplicated (D8), so _why_ a repo is
non-compliant can never drift from _whether_ it is.

The check's name, `SENTINEL_CHECK_RUN_NAME` (`"Sentinel / Capability
Compliance"`), is exported so a caller looking it up later (a re-run
guard, a test, a dashboard) never hand-copies the string. It stays a
human-readable "App / Report" label — `CodeQL` and `Devin Review` are the
nearest precedent, externally-posted checks with no
`.github/workflows/*.yml` behind them — rather than a
`platform.*`-style intent-vocabulary token: that vocabulary (epic #672,
D3) names `tasks:` entries backed by a reusable CI workflow, and this
check has no workflow behind it at all. Built from `SENTINEL_APP_NAME`
(`"Sentinel"`, exported from `src/utils/constants.ts`) rather than its
own literal — the brand prefix any future action reads from one source
instead of retyping.

## `handleWebhookRequest(request, env)`

Wires the four functions above into a single request handler:
`parseWebhookEvent → validateConfig → syncPropertiesFromConfig →
postCheckRun`, all through an installation-scoped `GitHubClient` built
via `@theholocron/github-client`'s `createInstallationClient()` — the
installation id always comes from the webhook payload itself (D10), so
one App registration handles installations across any number of
orgs/accounts unchanged.

A plain `(Request, Env) => Response` function — deliberately
deploy-target-agnostic, no framework, no platform-specific `{ fetch }`
wrapper. `Env` is `{ GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY,
SENTINEL_WEBHOOK_SECRET }`, wired via `holocron secrets sync` once that
PR-stack item lands. `installation.created`/`installation.deleted` are
acknowledged only — no per-installation action is defined in v1.
`push.default-branch` and `pull_request.opened`/`synchronize` run the
identical pipeline (D8, same engine — only the commit SHA the check run
attaches to differs), but only once `validateConfig()` reports
`"valid"`: a missing/broken config is acknowledged without a check run.

Deploy target: **Vercel Functions**, not Cloudflare Workers — reversed
mid-build once this handler surfaced why: `validateConfig()` needs a
real filesystem and real dynamic `import()` (to execute a fetched
`holocron.config.ts` as an actual module), neither of which Workers'
V8-isolate model has. See `.notes/tech-sentinel-v1.spec.md`'s "Resolved
— deploy target" section for the full account.

## Deploying

`holocron.config.ts` in this directory — separate from the monorepo
root's own config, since Sentinel is deployed as its own product, not
built/released the way the CLI or the plugins are — wires the
`deployment` (Vercel), `dns` (Cloudflare), and `vault` (Doppler)
providers.

```bash
pnpm run delivery.deploy
```

A real, production deploy — there's no separate staging/dev
environment for Sentinel (see "Why production only" below). Builds,
assembles the deploy payload, then calls `holocron deploy --files
--target production`, which calls `deployFunction()` — no linked Git
repo required, since this ships as an npm package, not a
deployed-from-source-control app.

### Custom domain (one-time)

`delivery.deploy` doesn't touch the custom domain — that's a one-time
setup step, not something to redo on every deploy:

```bash
holocron setup --cwd packages/sentinel
```

Attaches `sentinel.theholocron.dev` (declared in `holocron.config.ts`)
to the Vercel project via `Deployment.ensureCustomDomain()`, then hands
the CNAME verification challenge Vercel returns straight to
Cloudflare's `dns` capability — fully automated, no manual DNS entry.
Sentinel has no `source` provider configured, so every repo-settings
step `holocron setup` normally runs is cleanly skipped; only the
`deployment`/`dns`/`vault` steps this config actually declares run.

### Why production only

A GitHub App has exactly one webhook URL, configured once in its
settings. A preview deploy's URL changes on every single deploy — the
App's webhook URL would need editing after every code change, which
isn't workable for something that has to keep receiving live
webhooks. So there's no standing "dev" or "staging" deployment for
Sentinel the way a typical web app might have one; production is the
only target that means anything operationally. For testing before a
real deploy: `holocron deploy --dry-run` verifies the wiring without
touching Vercel, and the 73+ tests exercise `handleWebhookRequest`
directly — that's this package's actual "dev environment," not a
deployed URL.

### `api/webhook.mjs` and `scripts/stage-deploy.mjs`

`handleWebhookRequest` itself is deliberately deploy-target-agnostic
(no `req`/`res` translation, no platform-specific wrapper — see
`src/handler.ts`'s own docstring). `api/webhook.mjs` is the thin
Vercel-specific adapter: Vercel's Functions convention deploys any
file under `/api` as a Function, and its "fetch Web Standard" handler
shape (`export default { fetch(request) {...} }`) is already
`handleWebhookRequest`'s own signature — nothing to translate.

`dist/index.mjs` (this package's built library) keeps
`@theholocron/*` imports external, not bundled (the `library` tsdown
preset's default) — so deploying `dist/` alone isn't enough; Vercel
needs to `npm install` them. `scripts/stage-deploy.mjs` assembles
`.vercel-deploy/` — `api/webhook.mjs` + `dist/index.mjs` + a **trimmed**
`package.json` (name/version/type + `dependencies` only, no
devDependencies/scripts, each dependency pinned to the exact version
resolved in `node_modules` right now — not the `workspace:`/`catalog:`
pnpm protocol specifiers Vercel's plain `npm install` can't resolve).
Deploy from a synced `alpha` checkout (packages publish on every
merge), not an unreleased local branch, or a pinned version can 404
against the registry.

## GitHub App registration (manual, one-time)

Creating the App itself is a web-UI flow — no API for it, nothing to
automate. Register it at <https://github.com/settings/apps/new> (or
under an org: `https://github.com/organizations/<org>/settings/apps/new`).

**Order:** deploy first, then attach the custom domain, then register.
Run the ["Deploying"](#deploying) steps once you have a Vercel token
set (`holocron auth set vercel <token>` or `VERCEL_TOKEN`), then the
["Custom domain"](#custom-domain-one-time) step — `holocron setup
--cwd packages/sentinel` attaches `sentinel.theholocron.dev` and hands
Cloudflare the verification CNAME automatically. That domain, not a
per-deployment `*.vercel.app` URL, is the stable webhook URL below.

### App info

| Field                                                  | Value                                                                                                                                                                                              |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GitHub App name                                        | `Holocron Sentinel` — App names are unique **across all of GitHub**, not just this org; a bare `Sentinel` is almost certainly taken. Pick something distinctive if this is too.                    |
| Description                                            | `Holocron's minimal GitHub App — validates holocron.config.ts, syncs capability status to repo properties, and posts a compliance check run on every push to the default branch and pull request.` |
| Homepage URL                                           | `https://github.com/theholocron/holocron/tree/main/packages/sentinel#readme` (this package's own `package.json` `homepage`)                                                                        |
| Callback URL                                           | Leave blank — no user-facing OAuth login flow (v1 never authenticates as a user)                                                                                                                   |
| Identifying and authorizing users | Leave blank - no user-facing OAuth login flow (v1 never authenticates as a user)
| Setup URL (optional)                                   | Leave blank                                                                                                                                                                                        |
| Request user authorization (OAuth) during installation | Leave **unchecked** — Sentinel only ever uses installation access tokens (App-level auth), never impersonates a user                                                                               |
| Enable Device Flow                                     | Leave **unchecked** — not a CLI-auth use case                                                                                                                                                      |
| Webhook → Active                                       | **Checked**                                                                                                                                                                                        |
| Where can this GitHub App be installed?                | "Only on this account" (`theholocron`) to start — D10 (org-portability) means installing it elsewhere later needs zero code changes, so this isn't a one-way door                                  |

### Repository permissions

| Permission        | Access | Why                                                                                   |
| ----------------- | ------ | ------------------------------------------------------------------------------------- |
| Contents          | Read   | `git.getContents()` / `git.getTree()` — reading `holocron.config.ts` + workspace tree |
| Checks            | Write  | `checks.createCheckRun()` — the capability-compliance check run                       |
| Custom properties | Write  | `properties.setProperties()` — syncing resolved capabilities to repo properties       |
| Pull requests     | Read   | required to _receive_ `pull_request` webhook events (v1 never writes PR comments)     |
| Metadata          | Read   | mandatory baseline — auto-included                                                    |

No other permissions — v1 never writes to Contents, never comments,
never touches Actions/Administration.

### Subscribe to events

`push`, `pull_request`, `installation`

### Webhook

- **Webhook URL** — `https://sentinel.theholocron.dev/api/webhook`,
  once the ["Custom domain"](#custom-domain-one-time) step has
  attached it. Stable across every future deploy, unlike a
  per-deployment `*.vercel.app` URL.
- **Webhook secret** — generate one (e.g. `openssl rand -hex 32`) and
  set it in the App's "Webhook secret" field. This becomes
  `SENTINEL_WEBHOOK_SECRET` in the deploy env — save it to the Doppler
  `sentinel`/`prd` config right away so it isn't lost.
- **Where to install it** — this org (`theholocron`) to start;
  D10 (org-portability) means installing it on another org/account
  later needs zero code changes.

### Private key

Generate one from the App's settings page after creation — that's
`GITHUB_APP_PRIVATE_KEY`, also destined for Doppler's `sentinel`/`prd`
config. Generating a new key at any point invalidates the previous
one, so only do this once and store the result immediately.

### After registration

Both secrets (`SENTINEL_WEBHOOK_SECRET`, `GITHUB_APP_PRIVATE_KEY`) plus
the App id (`GITHUB_APP_ID`, shown on the App's settings page) go into
Doppler — see `holocron.config.ts` in this directory for the
`vault` provider wiring. The still-open "Secrets flow" work
(`holocron secrets sync`) will push them from there into Vercel's env
vars; until then, set them directly via `holocron deploy`'s underlying
`deployment` capability (`setEnvVar`) or Vercel's own dashboard.

## Development

| Script                                  | Description                                 |
| --------------------------------------- | ------------------------------------------- |
| `pnpm run delivery.build`               | Bundle with tsdown                          |
| `pnpm run verification.unitTests`       | Run the vitest suite (always with coverage) |
| `pnpm run verification.typeSafety`      | `tsc --noEmit`                              |
| `pnpm run sourceQuality.staticAnalysis` | ESLint                                      |

## Releases

Automated via semantic-release. See [CHANGELOG.md](../../CHANGELOG.md).

## Documentation

<https://theholocron.github.io/holocron/>
