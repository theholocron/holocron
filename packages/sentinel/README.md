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

## `validateConfig({ client, repo, ref? })`

Fetches `holocron.config.{ts,js,mjs,cjs,json}` (TS-first probe order) via
`@theholocron/github-client`'s `git.getContents()`, then an optional
`astromech.config.*` at the same ref, merged on top with astromech's own
`mergeTasksLayers()` — the same manifest `holocron run` / `ci` / `sync`
act on (holocron#916; a task declared only in the dedicated file, like
this repo's `platform.repoValidation`, gates Sentinel checks too) — and
validates the merged `tasks` array against `@theholocron/astromech`'s
canonical task registry.
`ref` omitted (the common case, every check except auto-fix-commit) reads
the repo's default branch. A caller passes `ref` explicitly to validate a
specific commit/branch instead — used only by the auto-fix-commit
check (holocron#820), which needs to see what a PR's _own_ branch
currently declares. Safe because this function only ever validates —
never persists or writes anything — so nothing derived from an
unreviewed PR branch can leak into anything that does (properties sync,
the capability-compliance check, Bucket 2 dispatch gating all stay on the
ref-less, default-branch call). Same-repo only either way (D6): a fork's
branch is never a valid `ref` here. Returns one of:

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

Wires the capability-compliance pipeline above (`parseWebhookEvent →
validateConfig → syncPropertiesFromConfig → postCheckRun`) together with
eleven more independent Bucket 1 check pipelines — commit standards
(commitlint), DCO (holocron#900 — the org-wide replacement for
`probot/dcoapp`; no real tool to delegate to, so a deliberate, narrow
reimplementation of the one stable rule — every commit needs a
`Signed-off-by` trailer matching its own author or committer identity,
case-insensitively; merge commits and bot-authored commits are exempt;
runs alongside the existing probot/dcoapp install for now, not instead
of it — see `src/actions/dco/lint-dco.ts`'s own module docstring),
inclusive language (alex), formatting (prettier,
holocron#819, purely advisory — no severity axis, 100% mechanical),
editorconfig (the `editorconfig` package's own `matcher()` API resolving
each changed file's properties purely in-memory, skipping the same paths as
the generated `.editorconfig-checker.json` — markdown, `LICENSE`, `public/` —
via `@theholocron/cli`'s `isEditorConfigExcluded()`, holocron#927; unlike formatting,
`conclusion: "failure"` on any violation — but also 100% mechanical, so
the failure is meant to be transient, auto-fix-commit (below) resolving
it on a fresh commit; see `src/actions/editorconfig/lint-editorconfig.ts`'s
own module docstring for why the value-checking/fixing layer on top is a
deliberate, narrow exception to "never reimplement a tool's rules"),
markdown lint (markdownlint, holocron#821), and static analysis (eslint,
holocron#849 — the one Bucket 1 check that isn't config-free: skipped
entirely when a repo's `runtime_environment` property is explicitly
`"none"`, since a docs-only repo has no JS/TS to lint; honors
`holocron.config.ts`'s own `eslint.browserPackages`, holocron#858, since
it's the one `library()` option this check needs to match a package's
local `eslint.config.ts` exactly), actionlint (holocron#904 — the
actionlint half of the same `sourceQuality.staticAnalysis` task, posted
as its own `Source Quality / Static Analysis / Run actionlint` check;
config-free, since any repo can carry workflow files. Real actionlint
v1.7.7 (`@tktco/node-actionlint`) and real ShellCheck 0.11
(`@vscode-shellcheck/shellcheck-wasm`), both WASM, linting each changed
`.github/workflows/*.{yml,yaml}` file. The `run:`-script ShellCheck pass
the actionlint binary gets from a `shellcheck` on PATH is ported by hand
from actionlint's own `rule_shellcheck.go`, since WASM can't spawn
processes — see `src/actions/actionlint/lint-actionlint.ts`'s own module
docstring), and repo validation (holocron#913 — two checks, gated on the
repo's `holocron.config` declaring `platform.repoValidation`:
`Platform / Repo Validation / Validate ADRs and specs` ports
`scripts/validate-adrs.mjs`'s frontmatter rules to the PR's own changed
`docs/wiki/decisions/*.md` and `*.spec.md` files — errors fail the check
and post a review, warnings are annotations on a `neutral` check — and
`Platform / Repo Validation / Validate docs presence` flags an added
`packages/<name>/src/index.ts` for a non-private package shipped without
any docs change; advisory like its script, `neutral` at worst, never
`failure`; and, holocron#925, `Platform / Repo Validation / Validate
registry consistency`, which fails when a public package whose
`package.json` the PR adds or changes isn't in the **latest published**
`@theholocron/registry-doc` — fetched from npm at check time, sha512-verified
against the packument's `dist.integrity`, its self-contained
`dist/index.mjs` imported from a temp file and cached ten minutes per warm
instance, since the registry is compiled code a repo's pinned version
can't be read from; see `src/actions/repo-validation/`) — the Bucket 2
dispatch prototype, the auto-fix-commit
capability (holocron#820, one shared `with: { autoFix: boolean }` gate on
the `sourceQuality.formatting` task backing three independent commit
actions — `commitFormattingFix`, `commitEditorConfigFix`,
`commitMarkdownLintFix` — since all three checks are bundled under that
same task; default-on (holocron#864 follow-up), opt out via the repo's
merged config or fresh in a PR's own branch, either way), and the
advisory PR Config Validation check (holocron#827 — posted as `Platform
/ Compliance / Run Holocron config compatibility (pull_request)`, a
"(pull_request)" suffix on the same concept, not a distinct name;
validates a PR's own branch immediately, without waiting for merge,
kept separate from the required `Platform / Compliance / Run Holocron
config compatibility` check above), and a PR comment
explaining what auto-fix-commit changed (holocron#674/#834, executes
only when a fix was actually committed), all through an
installation-scoped `GitHubClient` built via `@theholocron/github-client`'s
`createInstallationClient()` — the installation id always comes from the
webhook payload itself (D10), so one App registration handles
installations across any number of orgs/accounts unchanged. See
`src/handler.ts`'s own module docstring for the full, current pipeline
list — kept there as the one source of truth rather than duplicated here,
since this section had already drifted out of sync with it once.

A plain `(Request, Env) => Response` function — deliberately
deploy-target-agnostic, no framework, no platform-specific `{ fetch }`
wrapper. `Env` is `{ GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY,
SENTINEL_WEBHOOK_SECRET }`, wired via `holocron secrets sync`. Two more
Doppler-sourced values (`SENTINEL_AXIOM_INGEST_TOKEN`, `AXIOM_DATASET`)
feed the module-level logger directly, via `@theholocron/env-utils`
(never bare `process.env`, this org's own convention) — see
`src/handler.ts`'s own comment for why. `installation.created`/`installation.deleted` are
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

**CI-triggered, too** (holocron#800) — `.github/workflows/sentinel.deploy.yml`
runs this same command on every merge to `main` (not `alpha` — this repo's
stable channel only, matching the release-branch split in the repo root's
`CLAUDE.md`), scoped to `packages/sentinel/**` changes, or on demand via
`gh workflow run sentinel.deploy.yml`. Hand-maintained directly in this
repo, not astromech-templated — Sentinel is owned here, not synced to
`theholocron/.github` for other repos to use. See `docs/tokens.md` (repo
root) for the `VERCEL_TOKEN` repo secret it needs.

**After every alpha release that touches it** (holocron#928) — the
`scripts/deploy-on-release.mjs` semantic-release plugin, appended to the
repo root's `release.config.ts`, runs this same command from the release's
`success` step. semantic-release only reaches `success` once every package
has published, so the `@theholocron/*` versions `stage-deploy.mjs` pins are
always on npm (a hand-dispatched deploy once raced the release and lost by
five seconds). It deploys only on the `alpha` channel and only when the
release changes `packages/sentinel/` or a workspace package inlined into
`dist/` (`cli`, `astromech`, `datapad`), and a deploy failure is logged,
never fails the already-published release — redeploy with the workflow
above. `VERCEL_TOKEN` reaches the release step through astromech's shared
`delivery.publish.yml`.

A real, production deploy — there's no separate staging/dev
environment for Sentinel (see "Why production only" below). Builds,
assembles the deploy payload, then calls `holocron deploy --files
--target production`, which calls `deployFunction()` — no linked Git
repo required, since this ships as an npm package, not a
deployed-from-source-control app. `holocron deploy` then waits for Vercel to finish
building the deployment and fails (non-zero exit, with Vercel's own
error message) unless it ends `ready`. Vercel builds asynchronously,
and before holocron#911 an `npm install` failure there was reported as
a successful deploy while production quietly kept serving the previous
one.

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

`dist/index.mjs` (this package's built library) keeps its npm
dependencies external, not bundled — everything except the three
inlined workspace packages below — so deploying `dist/` alone isn't
enough; Vercel needs to `npm install` them. `scripts/stage-deploy.mjs` assembles
`.vercel-deploy/` — `api/webhook.mjs` + `dist/index.mjs` + a **trimmed**
`package.json` (name/version/type + `engines` + `dependencies` only, no
devDependencies/scripts, each dependency pinned to the exact version
resolved in `node_modules` right now — not the `workspace:`/`catalog:`
pnpm protocol specifiers Vercel's plain `npm install` can't resolve).
Deploy from a synced `alpha` checkout (packages publish on every
merge), not an unreleased local branch, or a pinned version can 404
against the registry. The workspace packages Sentinel imports
(`@theholocron/astromech`, `datapad`, `cli`) are inlined into `dist/`
rather than installed (holocron#922, `tsdown.config.ts`): Vercel installs a
published version, and a deploy made between a merge and its release once
pinned the previous release, which lacked an export Sentinel's code needed —
every webhook crashed on import. Their own npm dependencies stay external
(`@theholocron/cli` reaches a native binary that must be installed for
Vercel's platform), so staging refuses when `dist/` imports a package that
isn't in this package's `dependencies` (`scripts/bundle-externals.mjs`).
`engines.node` is rewritten from this package's own range
to the `<major>.x` form Vercel accepts (`>=22` → `22.x`,
`scripts/vercel-engines.mjs`): Vercel picks the function's Node version
from it, and rejects an open range with `invalid_version_value`
(holocron#911).

## GitHub App registration (manual, one-time)

Creating the App itself is a web-UI flow — no API for it, nothing to
automate. **Register it under the org, not your personal account:**
`https://github.com/organizations/theholocron/settings/apps/new`. Using
the personal-account URL (`https://github.com/settings/apps/new`)
still creates a working App, but "Where can this GitHub App be
installed?" → "Only on this account" then scopes installation to
_your_ account, not `theholocron` — the install page will only offer
you as a target, not the org. Fixable without re-registering (App
settings → Advanced → Transfer ownership → `theholocron`), but
registering under the org from the start avoids the detour.

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
| Identifying and authorizing users                      | Leave blank — no user-facing OAuth login flow (v1 never authenticates as a user)                                                                                                                   |
| Setup URL (optional)                                   | Leave blank                                                                                                                                                                                        |
| Request user authorization (OAuth) during installation | Leave **unchecked** — Sentinel only ever uses installation access tokens (App-level auth), never impersonates a user                                                                               |
| Enable Device Flow                                     | Leave **unchecked** — not a CLI-auth use case                                                                                                                                                      |
| Webhook → Active                                       | **Checked**                                                                                                                                                                                        |
| Where can this GitHub App be installed?                | "Only on this account" (`theholocron`) to start — D10 (org-portability) means installing it elsewhere later needs zero code changes, so this isn't a one-way door                                  |

### Repository permissions

| Permission        | Access | Why                                                                                                                                                                                                                                                                         |
| ----------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Contents          | Write  | `git.getContents()` / `git.getTree()` — reading `holocron.config.ts` + workspace tree; `git.createBlob/createTree/createCommit/updateRef()` — auto-fix-commit (holocron#820), default-on (holocron#864)                                                                     |
| Checks            | Write  | `checks.createCheckRun()` — the capability-compliance check run                                                                                                                                                                                                             |
| Custom properties | Write  | `properties.setProperties()` — syncing resolved capabilities to repo properties                                                                                                                                                                                             |
| Issues            | Write  | `issues.createComment()` — the auto-fix PR comment (holocron#674/#834), posted only when auto-fix-commit actually committed something                                                                                                                                       |
| Pull requests     | Write  | required to _receive_ `pull_request` webhook events; write is consumed by `pulls.createReview()`/`listReviewThreads()`/`resolveReviewThread()` — error-severity eslint/markdownlint/actionlint findings post as a PR review, not only a check-run annotation (holocron#860) |
| Actions           | Write  | `actions.createWorkflowDispatch()` — the Bucket 2 dispatch prototype (holocron#769/#794, `tech-sentinel-ci-runner.spec.md`)                                                                                                                                                 |
| Metadata          | Read   | mandatory baseline — auto-included                                                                                                                                                                                                                                          |

No other permissions — never touches Administration.

**Contents bumped from Read to Write for holocron#820, Issues bumped from
none to Write for holocron#834, Pull requests bumped from Read to Write and
Actions added at Write for the Bucket 2 dispatch prototype** — real
permission escalations, not something code or an API call can grant. Update
in the App's own settings page (Settings → Developer settings → GitHub Apps
→ Holocron Sentinel → Permissions & events), then accept the updated
permissions for the `theholocron` installation. Auto-fix-commit is
default-on (holocron#864) — opt out via `with: { autoFix: false }` on
`sourceQuality.formatting`, merged to the repo's default branch or added
fresh in a PR's own branch (see `handleWebhookRequest`'s own docstring in
`src/handler.ts`, and `validate-config.ts`'s module docstring for the
read-only boundary that makes a PR-branch read safe).

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
Doppler first — see `holocron.config.ts` in this directory for the
`vault` provider wiring — then out to Vercel's env vars. Two more keys
already live in the same Doppler config for the Axiom log-shipping
transport (holocron#780): `SENTINEL_AXIOM_INGEST_TOKEN` (a
narrower-scoped, ingest-only token — deliberately not the same
credential as any broader `AXIOM_TOKEN` used elsewhere in this org) and
`AXIOM_DATASET` (`holocron-sentinel`, not a secret, but synced the same
way for one source of truth).

```sh
holocron secrets sync prd --cwd packages/sentinel --project-id sentinel --target production \
  --github-secret SENTINEL_AXIOM_INGEST_TOKEN --github-secret-scope org=theholocron \
  --org theholocron --token github=$(gh auth token)
```

**CI-triggered, too** (holocron#800) — `.github/workflows/sentinel.secretsSync.yml`
runs the same invocation via `gh workflow run sentinel.secretsSync.yml`
(`workflow_dispatch` only, never automatic — matches "run once after
registration, again only when a secret rotates" below). Uses a dedicated
`HOLOCRON_SECRETS_TOKEN` repo secret in place of `gh auth token`, since CI
has no equivalent of a human's already-authenticated session — see
`docs/tokens.md`'s "CI-only exception: org-scoped secret writes" (repo
root) for why a new, narrowly-scoped token rather than widening an existing
one.

- **`--target production` only.** Sentinel has no branch-based preview
  deployments (`deployFunction()` ships inline files, no Git-linked
  preview flow) — the command's `production`+`preview` default would
  create a `preview`-target env var here that nothing ever reads.
- **`--github-secret`/`--github-secret-scope`.** Of the 5 Doppler keys,
  only `SENTINEL_AXIOM_INGEST_TOKEN` has a GH Actions consumer
  (`theholocron/.github`'s `platform.dispatchedCheck.yml`) — and it
  needs **org** scope, since any repo with Bucket 2 dispatch enabled
  needs `.github`'s workflow to see it, not only this one. Omitting
  these two flags would push every key as a pointless repo secret on
  `holocron` instead (nothing there reads them).
- **`--token github=$(gh auth token)`.** None of holocron's own
  provisioned GitHub tokens (`docs/tokens.md`, repo root) carry the
  org-level Secrets permission this write needs — `github.admin` is
  repo-scoped, `github.org` doesn't include it. Your own `gh` CLI
  session already has it (it's almost certainly how this org secret
  was first set) — reuse it inline rather than provisioning a new
  token for one recurring write.
- **Manual, on-demand — not part of `delivery.deploy`.** Run it once
  after registration, and again only when a secret actually rotates.
  Wiring it into every recurring deploy would re-push unchanged
  secrets on every `delivery.deploy` run for no reason.
- **Vercel snapshots env vars at deploy time** — a running deployment
  doesn't pick up a sync until the next deploy. Run
  `pnpm run delivery.deploy` right after syncing if the App needs the
  new value immediately, not on its next unrelated deploy.
- Doppler's own auto-injected bookkeeping (`DOPPLER_PROJECT`,
  `DOPPLER_CONFIG`, `DOPPLER_ENVIRONMENT`) is filtered out before
  anything reaches Vercel — only real secrets cross over.

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
