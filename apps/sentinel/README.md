# `@theholocron/sentinel`

Holocron's minimal GitHub App — webhook receiver, default-branch-only
`holocron.config.ts` validation, custom-properties sync, one check run per
resolution run.

> A sentinel droid: it watches, validates, and reports — never acts on its
> own. Deploy target: Vercel Functions — see
> `docs/wiki/specifications/tech-sentinel-v1.spec.md`'s "Resolved — deploy
> target" section for why (reversed from
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
(`src/handler/handler.ts`) is the orchestration sitting above both — utils to
decide, actions to report, never the other way around.

## `validateConfig({ client, repo, ref? })`

Fetches `holocron.config.{ts,js,mjs,cjs,json}` (TS-first probe order) via
`@theholocron/github-client`'s `git.getContents()`, then an optional
`astromech.config.*` at the same ref, merged on top with datapad's
`loadLayeredFromContent()` — the same manifest `holocron run` / `ci` / `sync`
act on (holocron#916; a task declared only in the dedicated file, like
this repo's `validate`, gates Sentinel checks too) — and
validates the merged `tasks` array against `@theholocron/astromech`'s
canonical task registry.
`ref` omitted (the common case, every check except auto-fix-commit) reads
the repo's default branch. A caller passes `ref` explicitly to validate a
specific commit/branch instead — used only by the auto-fix-commit
check (holocron#820), which needs to see what a PR's _own_ branch
currently declares. Safe because this function only ever validates —
never persists or writes anything — so nothing derived from an
unreviewed PR branch can leak into anything that does (properties sync,
the capability-compliance check all stay on the
ref-less, default-branch call). Same-repo only either way (D6): a fork's
branch is never a valid `ref` here. Returns one of:

| `status`          | Meaning                                                         |
| ----------------- | --------------------------------------------------------------- |
| `"valid"`         | Config loaded; every task name is in the registry.              |
| `"no-config"`     | No `holocron.config.*` in any probed extension.                 |
| `"unknown-tasks"` | Config loaded; `unknownTasks` lists names outside the registry. |
| `"load-error"`    | A `holocron.config.*` exists but couldn't be parsed/executed.   |

### The `.holocron/` directory (holocron#1785)

A repo can keep the big declarations of its config in `.holocron/<area>.*`
(`notifications`, `repo`; see the CLI README). `validateConfig` lists
`.holocron/` at the same `ref` as the config, fetches every file in it
(all levels, `fetchConfigDir()`), writes the tree into the sandbox with
datapad's `writeConfigDir()` _before_ the config is evaluated (the config
may import from it), loads the area files with `loadConfigDir()` and places
them with the CLI's own `placeAreas()` (exported from `@theholocron/cli`
with `HOLOCRON_AREAS`). The returned `config` is therefore the merged one,
and role sync, property sync and the PR config check all see the layout and
the `repo` block. Everything written to the sandbox is never evaluated unless
the config or an area file imports it, so an area file may import a sibling
and a stray file does nothing. A repo with no `.holocron/` (the listing
404s) behaves as before, and a new area needs no change in Sentinel. The
directory is read at the same `ref` as the config, so the D4/D6 boundary is
unchanged: a `ref` read is for validation only, and everything that writes
stays on the default branch.

Pictures (`.png`, `.jpg`, `.gif`, `.webp`, `.svg` and the like, e.g.
`.holocron/media/`) are left out before any cap applies: a config only names
them by path, so they are neither fetched nor counted.

Caps (the tree comes from a repo others can write to), on the files that are
fetched: at most 50 files,
100 KB per file (the same cap as `readRepoText()`), 512 KB in all. Past a
cap, or when an area file does not load or conflicts with an inline value,
the result is `load-error`. Symlinks and submodules are skipped. A GitHub
failure other than a 404 propagates, as for every other read.

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
deploy target assumed, even though Vercel (ADR-0011,
`docs/wiki/specifications/tech-sentinel-v1.spec.md`) is what it actually
runs on. Throws `WebhookVerificationError` for a missing/wrong secret, a
missing/malformed signature, a missing `X-GitHub-Event` header, or a body
that isn't valid JSON. Returns one of:

| Result               | Meaning                                                                                                                                                                  |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `{ handled: true }`  | One of v1's three event categories — `event` carries the normalized `SentinelEvent`.                                                                                     |
| `{ handled: false }` | A validly-signed delivery outside v1 scope (e.g. a non-default-branch push, any other check run, an unrelated `X-GitHub-Event`) — not an error, just not actionable yet. |

`SentinelEventType` is one of `"installation.created"`,
`"installation.deleted"`, `"push.default-branch"`,
`"pull_request.opened"`, `"pull_request.synchronize"`, plus the events of the
`#prs` feed: `"pull_request.feed"` (reopened, ready_for_review,
converted_to_draft, review requested/removed, labeled, closed), `"pull_request_review"`
(submitted, dismissed) and `"check_run.completed"` (only the one named
`ci / Required checks`). The feed events run none of the checks above. `repo` and
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
(`"Sentinel"`, exported from `src/utils/constants/constants.ts`) rather than its
own literal — the brand prefix any future action reads from one source
instead of retyping.

## `handleWebhookRequest(request, env, options?)`

**Answer first, work after.** GitHub gives up on a delivery after about 10 seconds ("Recent deliveries" shows
`context deadline exceeded`), and a pull request's work (config read, feed, board, labels, aggregate and about nine check
posts) takes tens of seconds. With `options.waitUntil` (Vercel's, handed in by `api/webhook.mjs`) the signature is checked
and the event read, `202 { handled, type, deferred: true }` is sent at once and the work runs inside `waitUntil`, for as
long as `maxDuration` in `vercel.json` (300 seconds) allows. A bad signature is still `401`, and a ping or an unhandled
event is still answered inline. The GitHub-call counts, the `githubDelivery` line and the logger and error-tracker
flushes happen when the work ends. The cost: a failure can no longer be the response's status, so a delivery that
failed shows `202` in GitHub; look for the `handleWebhookRequest: unhandled error` and `deferred work answered an error
status` log lines and the error tracker instead (`doctor github-app`'s `deliveries` row no longer sees them, and
`redeliver webhooks` has nothing to redeliver). Without `waitUntil` (tests, `holocron dev serve`) the work is awaited and
its status is the response, as before.

Wires the capability-compliance pipeline above (`parseWebhookEvent →
validateConfig → syncPropertiesFromConfig → postCheckRun`) together with
eleven more independent Bucket 1 check pipelines — commit standards
(commitlint), DCO (holocron#900 — the org-wide replacement for
`probot/dcoapp`, which it replaced (#1044); no real tool to delegate to, so a deliberate, narrow
reimplementation of the one stable rule — every commit needs a
`Signed-off-by` trailer matching its own author or committer identity,
case-insensitively; merge commits and bot-authored commits are exempt;
required by the ruleset as `validate:dco / Run Developer Certificate of Origin` — see `src/actions/dco/lint-dco/lint-dco.ts`'s own module docstring),
inclusive language (alex), formatting (prettier,
holocron#819, purely advisory — no severity axis, 100% mechanical),
editorconfig (the `editorconfig` package's own `matcher()` API resolving
each changed file's properties purely in-memory, skipping the same paths as
the generated `.editorconfig-checker.json` — markdown, `LICENSE`, `public/` —
via `@theholocron/astromech/lint`'s `isEditorConfigExcluded()`, holocron#927; unlike formatting,
`conclusion: "failure"` on any violation — but also 100% mechanical, so
the failure is meant to be transient, auto-fix-commit (below) resolving
it on a fresh commit; see `src/actions/editorconfig/lint-editorconfig/lint-editorconfig.ts`'s
own module docstring for why the value-checking/fixing layer on top is a
deliberate, narrow exception to "never reimplement a tool's rules"),
markdown lint (markdownlint, holocron#821; `.md` and `.mdx`, but in an `.mdx` file a `no-space-in-emphasis` finding
inside `{/* a comment */}` is ignored: markdownlint does not parse MDX, read the spaces inside the comment as spaces
inside emphasis, and its fix and prettier's undid each other, holocron#1950; real emphasis and every other rule are
still reported), and repo validation (holocron#913 — two checks, gated on the
repo's `holocron.config` declaring `validate`:
`validate:specs / Validate ADRs and specs` ports
the frontmatter rules of `holocron probe specs check` (`checkSpecs()` in
`@theholocron/astromech/repo-validation`, one implementation for both) to the PR's own changed
`docs/wiki/decisions/*.md` and `*.spec.md` files — errors fail the check
and post a review, warnings are annotations on a `neutral` check — and
`validate:docs / Validate docs` runs the same shared
rules as `holocron probe docs presence`
(`@theholocron/astromech/repo-validation`, holocron#929): it flags an added
`<dir>/src/index.ts` (any workspace layout) of a non-private package shipped
without any docs change, and a `feat` (read from the PR title and commit
subjects) that changes a public package's source without a README change, a
docs page named after it or an added doc comment, unless `[skip docs]
<reason>` (or `[skip docs: <package>] <reason>`) is in the PR description or a
commit message; advisory, `neutral` at worst, never `failure`, and re-run
when the PR title or description is edited; see `src/actions/repo-validation/`) — the auto-fix-commit
capability (holocron#820, one shared `with: { autoFix: boolean }` gate on
the `format` task backing three independent commit
actions — `commitFormattingFix`, `commitEditorConfigFix`,
`commitMarkdownLintFix` — since all three checks are bundled under that
same task (`format`, or its alias `sourceQuality.formatting`); default-on (holocron#864 follow-up), opt out via the repo's <!-- holocron-allow-old-name -->
 <!-- holocron-allow-old-name -->merged config or fresh in a PR's own branch, either way), and the

advisory PR Config Validation check (holocron#827 — posted as `validate:config / Run Holocron config compatibility (pull_request)`, a
"(pull_request)" suffix on the same concept, not a distinct name;
validates a PR's own branch immediately, without waiting for merge,
kept separate from the required `validate:config / Run Holocron
config compatibility` check above), and a PR comment
explaining what auto-fix-commit changed (holocron#674/#834, executes
only when a fix was actually committed), all through an
installation-scoped `GitHubClient` built via `@theholocron/github-client`'s
`createInstallationClient()` — the installation id always comes from the
webhook payload itself (D10), so one App registration handles
installations across any number of orgs/accounts unchanged. See
`src/handler/handler.ts`'s own module docstring for the full, current pipeline
list — kept there as the one source of truth rather than duplicated here,
since this section had already drifted out of sync with it once.

A plain `(Request, Env) => Response` function — deliberately
deploy-target-agnostic, no framework, no platform-specific `{ fetch }`
wrapper. `Env` is `{ SENTINEL_GITHUB_APP_ID, SENTINEL_GITHUB_APP_PRIVATE_KEY,
SENTINEL_WEBHOOK_SECRET }` (the bare `GITHUB_APP_ID` and `GITHUB_APP_PRIVATE_KEY` of a deployment set before #1864 are still read), wired via `holocron sync secrets`. Three more
Vault-sourced values (`SENTINEL_AXIOM_INGEST_TOKEN`, `SENTINEL_AXIOM_DATASET`, `HOLOCRON_AXIOM_ORG`)
feed the module-level logger and the Axiom links directly, via `@theholocron/env-utils/lookup`
(never bare `process.env`, this org's own convention) — see
`src/handler/handler.ts`'s own comment for why. `installation.created`/`installation.deleted` are
acknowledged only — no per-installation action is defined in v1.
`push.default-branch` and `pull_request.opened`/`synchronize` run the
identical pipeline (D8, same engine — only the commit SHA the check run
attaches to differs), but only once `validateConfig()` reports
`"valid"`: a missing/broken config is acknowledged without a check run.

Deploy target: **Vercel Functions**, not Cloudflare Workers — reversed
mid-build once this handler surfaced why: `validateConfig()` needs a
real filesystem and real dynamic `import()` (to execute a fetched
`holocron.config.ts` as an actual module), neither of which Workers'
V8-isolate model has. See `docs/wiki/specifications/tech-sentinel-v1.spec.md`'s
"Resolved — deploy target" section for the full account.

## Deploying

`holocron.config.ts` in this directory — separate from the monorepo
root's own config, since Sentinel is deployed as its own product, not
built/released the way the CLI or the plugins are — wires the
`deployment` (Vercel), `dns` (Cloudflare), and `vault` (the `prod` layer of
the 1Password Environments, `<org>/<repo> - prod`) providers.

```bash
pnpm run deploy
```

**CI-triggered, too** (holocron#800) — the `deploy-sentinel` task
(`.github/workflows/ci.deploy-sentinel.yml`, generated) runs this same command
on every merge to `main` (not `alpha` — this repo's stable channel only,
matching the release-branch split in the repo root's `CLAUDE.md`), scoped to
`apps/sentinel/**` changes, or on demand via
`gh workflow run ci.deploy-sentinel.yml`. See `docs/tokens.md` (repo
root) for the `VERCEL_TOKEN` repo secret it needs.

**After every alpha release that touches it** (holocron#928, #930) — Sentinel
declares it in its own `holocron.config.ts`:

```ts
tasks: [{ name: "deploy", with: { on: "release", channel: "alpha" } }];
```

The shared `release` workflow then runs a separate **Deploy** job
after the release job, which calls `holocron deploy on-release`: it scans every
workspace package for such a task and, for each, runs the package's
`deploy` script when the release is on its `channel` (default `main`,
the stable release; Sentinel sets `alpha`) and changes the package or one of its `workspace:*` dependencies (the
packages inlined into `dist/`) — derived from `package.json` so there's no
second list to keep in sync; an explicit `with.paths` overrides it. Before
deploying it waits (up to five minutes) for npm to serve the release's new
versions of those dependencies: the release job returns once `npm publish`
has, but the registry can take a moment to serve a version it accepted seconds
ago, and Vercel's `npm install` runs the instant the deploy starts (a
hand-dispatched deploy once raced the release and lost by five seconds).

Because it is its own job it is its own check in the run, with its own log, and
`Re-run failed jobs` re-runs only the deploy, never the release. A broken
deploy (a missing Vercel token, a Vercel build error, npm not serving the
versions in time) marks that job red and nothing else: the release is already
published and stays so. `VERCEL_TOKEN` reaches only the Deploy job, never the
release job, and only because this repo opts in: `astromech.config.ts` sets
`deploy-on-release: true` on its `release` task. A second app needs
only its own `deploy` task with `on: "release"`.

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

`deploy` doesn't touch the custom domain — that's a one-time
setup step, not something to redo on every deploy:

```bash
holocron setup --cwd apps/sentinel
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

### `api/webhook.mjs` and `holocron deploy stage`

`handleWebhookRequest` itself is deliberately deploy-target-agnostic
(no `req`/`res` translation, no platform-specific wrapper — see
`src/handler/handler.ts`'s own docstring). `api/webhook.mjs` is the thin
Vercel-specific adapter: Vercel's Functions convention deploys any
file under `/api` as a Function, and its "fetch Web Standard" handler
shape (`export default { fetch(request) {...} }`) is already
`handleWebhookRequest`'s own signature — nothing to translate.

`dist/index.mjs` (this package's built library) keeps its npm
dependencies external, not bundled — everything except the three
inlined workspace packages below — so deploying `dist/` alone isn't
enough; Vercel needs to `npm install` them. `holocron deploy stage` assembles
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
isn't in this package's `dependencies` (`undeclaredExternals`).
`engines.node` is rewritten from this package's own range
to the `<major>.x` form Vercel accepts (`>=22` → `22.x`,
`vercelEngines`): Vercel picks the function's Node version
from it, and refuses an open range with `invalid_version_value`
(holocron#911).

### When the preview deploy stops

`deploy-preview` runs this package's `deploy:preview` script (the script is named with a colon because `holocron run` looks a task's script up by its script spelling, #1929). Two stops are not about the code in the pull request:

- **`deploy stage: refusing to stage … imports packages that aren't in this package's dependencies`.** The bundle imports a workspace package that only inlined code needs (`@theholocron/kyber` through `@theholocron/cli`, for one). Declare it in `package.json`, and add it to this package's `ignoreDependencies` in `knip.config.ts`, since nothing in `src/` imports it.
- **`Vercel POST /v13/deployments → 402`.** Vercel refuses the deployment because of the team's plan or payment. Nothing in the repository changes that; the check passes again once the plan allows previews.

## GitHub App registration (manual, one-time)

The App can be created from a manifest instead of the form below:
`holocron new github-app --manifest apps/sentinel/github-app.manifest.json
--name ... --webhook-url ... --org theholocron` (GitHub's manifest flow; it
needs one click on GitHub and writes the id, key and webhook secret to a
private `.credentials` file — see the command's page). The manifest holds
the permissions and events of the tables below, so a dev instance
(`The Holocron Sentinel - dev`, its webhook on your tunnel) is the same
command with another name and URL. Doing it by hand: **register it under
the org, not your personal account:**
`https://github.com/organizations/theholocron/settings/apps/new`. Using
the personal-account URL (`https://github.com/settings/apps/new`)
still creates a working App, but "Where can this GitHub App be
installed?" → "Only on this account" then scopes installation to
_your_ account, not `theholocron` — the install page will only offer
you as a target, not the org. Fixable without re-registering (App
settings → Advanced → Transfer ownership → `theholocron`), but
registering under the org from the start avoids the detour.

GitHub has no API that changes an existing App's permissions or events, so a
changed `github-app.manifest.json` means editing each instance by hand in its
settings page. `holocron doctor github-app` compares the manifest with every
instance declared in `githubApps` in `holocron.config.ts` (the production App and the
dev instance, whose id and key it reads in memory from the 1Password
Environment of the layer: `prod` and `dev`) and, for anything missing, prints the settings
page to fix it. After changing the manifest, run it and fix both instances
until it passes; it also fails while an installation has not accepted the new
permissions.

**Order:** deploy first, then attach the custom domain, then register.
Run the ["Deploying"](#deploying) steps once you have a Vercel token
set (`holocron new token vercel <token>` or `VERCEL_TOKEN`), then the
["Custom domain"](#custom-domain-one-time) step — `holocron setup
--cwd apps/sentinel` attaches `sentinel.theholocron.dev` and hands
Cloudflare the verification CNAME automatically. That domain, not a
per-deployment `*.vercel.app` URL, is the stable webhook URL below.

### App info

| Field                                                  | Value                                                                                                                                                                                              |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GitHub App name                                        | `Holocron Sentinel` — App names are unique **across all of GitHub**, not just this org; a bare `Sentinel` is almost certainly taken. Pick something distinctive if this is too.                    |
| Description                                            | `Holocron's minimal GitHub App — validates holocron.config.ts, syncs capability status to repo properties, and posts a compliance check run on every push to the default branch and pull request.` |
| Homepage URL                                           | `https://github.com/theholocron/holocron/tree/main/apps/sentinel#readme` (this package's own `package.json` `homepage`)                                                                            |
| Callback URL                                           | Leave blank — no user-facing OAuth login flow (v1 never authenticates as a user)                                                                                                                   |
| Identifying and authorizing users                      | Leave blank — no user-facing OAuth login flow (v1 never authenticates as a user)                                                                                                                   |
| Setup URL (optional)                                   | Leave blank                                                                                                                                                                                        |
| Request user authorization (OAuth) during installation | Leave **unchecked** — Sentinel only ever uses installation access tokens (App-level auth), never impersonates a user                                                                               |
| Enable Device Flow                                     | Leave **unchecked** — not a CLI-auth use case                                                                                                                                                      |
| Webhook → Active                                       | **Checked**                                                                                                                                                                                        |
| Where can this GitHub App be installed?                | "Only on this account" (`theholocron`) to start — D10 (org-portability) means installing it elsewhere later needs zero code changes, so this isn't a one-way door                                  |

### Repository permissions

| Permission        | Access | Why                                                                                                                                                                                                                                                       |
| ----------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Contents          | Write  | `git.getContents()` / `git.getTree()` — reading `holocron.config.ts` + workspace tree; `git.createBlob/createTree/createCommit/updateRef()` — auto-fix-commit (holocron#820), default-on (holocron#864)                                                   |
| Checks            | Write  | `checks.createCheckRun()` — the capability-compliance check run; `checks.listCheckRunsForRef()` — the failing checks the `#prs` feed lists                                                                                                                |
| Custom properties | Write  | `properties.setProperties()` — syncing resolved capabilities to repo properties                                                                                                                                                                           |
| Issues            | Write  | `issues.createComment()` — the auto-fix PR comment (holocron#674/#834), posted only when auto-fix-commit actually committed something; `issues.addLabels()` — the area labels on issues and pull requests (holocron#2430)                                 |
| Pull requests     | Write  | required to _receive_ `pull_request` webhook events; write is consumed by `pulls.createReview()`/`listReviewThreads()`/`resolveReviewThread()` — error-severity markdownlint findings post as a PR review, not only a check-run annotation (holocron#860) |
| Metadata          | Read   | mandatory baseline — auto-included                                                                                                                                                                                                                        |

No other repository permissions — never touches Administration.

The error review (`postErrorReview()`) posts only what is new (holocron#1950). A finding that already has an open thread
of the same check, with the same text at the same place, is not posted again as a second thread, wherever the diff has
moved since. Findings on lines outside the diff cannot be inline comments, so they are listed in the review's body with
a digest of the list (`<!-- sentinel:<check>:outside:<digest> -->`); a later run lists them again only when the list
differs from the one the newest review of that check gave, and posts no review at all when nothing is new. A finding
that goes away and comes back with the same list is not announced again (the earlier review still has it). A thread
whose finding is gone is resolved only if one of Sentinel's own Apps wrote it (`SENTINEL_BOT_LOGINS`: the production
App and the dev one that `holocron dev` runs, holocron#1968), never a person's.

### Organization permissions

| Permission | Access | Why                                                                                                                                                                                                                                                                                                             |
| ---------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Members    | Read   | `teams.members()` — role sync (holocron#1595) lists a team's members; only used when the role-sync settings below are set                                                                                                                                                                                       |
| Projects   | Write  | the `reconcile-projects` workflow mints an installation token with this permission to set board item statuses (`holocron reconcile project`, holocron#1744), and Sentinel's board-status handler uses it to set them on a pull request event (holocron#2388); an installed App has to be granted it by a person |

**Contents bumped from Read to Write for holocron#820, Issues bumped from
none to Write for holocron#834, and Pull requests bumped from Read to Write** — real
permission escalations, not something code or an API call can grant. Update
in the App's own settings page (Settings → Developer settings → GitHub Apps
→ Holocron Sentinel → Permissions & events), then accept the updated
permissions for the `theholocron` installation. (Actions, added at Write for the Bucket 2 dispatch prototype, is no longer requested: nothing uses it since #2263.) Auto-fix-commit is
default-on (holocron#864) — opt out via `with: { autoFix: false }` on
the `format` task (`{ name: "format", with: { autoFix: false } }`; the deprecated alias
`sourceQuality.formatting` still works, and `format` wins when both are present, holocron#1697), <!-- holocron-allow-old-name -->
merged to the repo's default branch or added fresh in a PR's own branch (see `handleWebhookRequest`'s own docstring in
`src/handler/handler.ts`, and `validate-config.ts`'s module docstring for the
read-only boundary that makes a PR-branch read safe).

The three fixers (prettier, markdownlint, editorconfig) are guarded against undoing each other (holocron#1950): before
a fix is committed Sentinel reads the pull request's commits (`findAutoFixLoop()`, the first 100 that GitHub lists),
and a fixer that already committed since the last commit of a person's is not run again. The pull request gets one
comment saying so (`postAutoFixLoopComment()`, looked for by its `<!-- sentinel:auto-fix-loop -->` marker), and the checks
keep reporting the finding until it is fixed by hand. A new commit of a person's starts auto-fixing again. A read that errors
of the commits blocks nothing. The commit subjects are `AUTO_FIX_SUBJECTS`, the one list the fixers write and the guard
reads.

An auto-fix commit changes only lines the pull request added (holocron#1950). A fixer reports on a whole changed file,
but rewriting a line the pull request never touched puts someone else's text into its diff, and is how two fixers that
disagree about one line came to commit 34 times undoing each other. Each lint result therefore carries `scopedFix`, the
fix limited to the changes on lines the pull request added (`scopeFix()` over a line diff of the fix, `lineHunks()`, with
the added lines read from the file's `patch` by `addedLines()`), and the commit writes that and nothing else; a file with
none is left out, and the "auto-formatted" comment lists only the files written. markdownlint's and editorconfig's edits
are judged line by line, as each is one line's own; prettier's are judged by run of changed lines, so a table it re-pads
for one added row is fixed whole. A finding on a line the pull request did not add is still reported by its check (the
checks' verdicts are unchanged) and is left for its author to fix. A file GitHub sent no `patch` for is fixed whole.

### Subscribe to events

`push`, `pull_request`, `installation`, plus `membership` and `organization` for role sync (holocron#1595), and `pull_request_review` and `check_run` for the `#prs` forum feed (holocron#1738), and `issues` for the area labels on issues (holocron#2430). The new subscriptions are set by hand on an App that already exists (Settings → Developer settings → GitHub Apps → Holocron Sentinel → Permissions & events → Subscribe to events); a dev instance registered from `github-app.manifest.json` gets them from the manifest.

### Webhook

- **Webhook URL** — `https://sentinel.theholocron.dev/api/webhook`,
  once the ["Custom domain"](#custom-domain-one-time) step has
  attached it. Stable across every future deploy, unlike a
  per-deployment `*.vercel.app` URL.
- **Webhook secret** — generate one (e.g. `openssl rand -hex 32`) and
  set it in the App's "Webhook secret" field. This becomes
  `SENTINEL_WEBHOOK_SECRET` in the deploy env — save it to the `prod` layer
  Environment (`<org>/<repo> - prod`) right away so it isn't lost.
- **Where to install it** — this org (`theholocron`) to start;
  D10 (org-portability) means installing it on another org/account
  later needs zero code changes.

### Role sync settings (optional)

Role sync keeps Discord roles equal to GitHub teams (`docs/wiki/specifications/tech-sentinel-role-sync.spec.md`). It is off unless all three are in the deploy env: `SENTINEL_ROLE_SYNC_REPO` (`owner/repo` whose default-branch config declares the Discord layout), `HOLOCRON_DISCORD_BOT_TOKEN` and `HOLOCRON_USER_SYNC_TOKEN` (the `github.user-sync` token). Put them in the 1Password Environment `Sentinel` and run `holocron sync secrets --env Sentinel`.

### `#prs` forum feed settings (optional)

The feed keeps one forum post per pull request in the `#prs` forum (`docs/wiki/specifications/tech-sentinel-pr-feed.spec.md`, holocron#1738): the post is titled `repo#123: title`, the first message is a summary that is edited as the pull request changes (a link without the title, the status lines, then the pull request's description with Sourcery's parts and HTML comments removed), the post's tag is its state (`draft`, `conflicts`, `failing`, `changes requested`, `ready`, `waiting`, `merged`, `closed`), and messages are appended when it opens, when `ci / Required checks` finishes (passed, or did not pass, with the failing checks linked, five at most) and when it closes, after which the post is archived and locked. A redelivery adds nothing twice: each appended line ends with a marker (`-# ci: <sha> <conclusion>`, `-# pr: opened`) that is looked for first.

It needs no secret of its own. It reads the layout from the repository role sync uses, so it is off, with a quiet `skipped`, unless `SENTINEL_ROLE_SYNC_REPO` and `HOLOCRON_DISCORD_BOT_TOKEN` are set and a forum in the layout has `feeds: { prs: true }`; the object form lists `exclude: { repos, authors }` to leave out. Archived repositories, and pull requests of a repository in another organization than the layout's, are skipped. `holocron setup notifications` makes the forum and `holocron doctor notifications` checks it, its tags and that the bot can post and manage threads there. A feed error answers 500 with the reason, so the delivery can be redelivered, and never changes what the other checks do.

### Board status settings (optional)

Sentinel moves the board item of each issue a pull request closes as the pull request moves (`.notes/tech-board-status-automation.spec.md`, holocron#2388, part 5). It runs on `pull_request` (opened, reopened, ready for review, converted to draft, closed) and on the completed `ci / Required checks` check run, reads the pull request's `closingIssuesReferences` from the API (never the webhook payload), finds each issue's item on the boards `providers.projects` declares and applies the same two rules `holocron reconcile project` applies hourly, `planReconcile()` then `planPullRequestStatus()`, through `Projects.setStatus`: an open pull request (a draft too) is In Progress, a green aggregate is In Review, a failing one moves it back, and Blocked and Done keep winning. The check run is filtered before anything is fetched.

It needs no secret of its own: it reads `providers.projects` from the repository `SENTINEL_ROLE_SYNC_REPO` names and writes with the installation's token, so it is off, with a quiet `skipped`, unless that is set and the config declares a `github` projects provider with a board on a built-in template (a repo's own template files are not fetched). A redelivery changes nothing, an item that cannot be moved is logged and never fails the delivery, and the hourly `reconcile-projects` run repairs a miss. The App must be granted the organization Projects write permission (`organization_projects` in `github-app.manifest.json`); a person accepts it on each installed App.

### The `ci` aggregate (optional)

Sentinel can compute the required check `ci / Required checks` itself (`.notes/process-sentinel-posts-ci.spec.md`, SPEC-0099, holocron#2426, phase 3). **Today the Actions poller (`ci/workflows/ci.yml`) is still the poster.** This is the shadow: Sentinel posts the same verdict under `ci / Required checks (sentinel)`, which no ruleset requires, so the two can be compared on the same commit before anything changes.

It is **off unless `SENTINEL_CI_AGGREGATE` is `shadow` or `on`** in the deploy environment; unset, empty or any other value does nothing and fetches nothing, so deploying this changes no deployment. `shadow` posts only the shadow. `on` posts the **real** `ci / Required checks` for a pull request whose **head** config says `ci: { aggregate: "sentinel" }` and the shadow for every other, so each commit has exactly one poster of the real check (the setting is read at the head because it must match the workflow files that run for that commit, and cached per commit for five minutes; a head with no usable config counts as `actions`). When it is on it reads, never from a webhook payload but from the API, the pull request (open, and the commit still its head), the pull request's **base** branch config for `expected` (so a pull request cannot shrink its own gate; a warm instance caches it for five minutes), and the head commit's check runs and commit statuses, and calls astromech's `postAggregate()`, the function `holocron reconcile ci` and the sweep use. It runs on:

- `pull_request` opened, a push, reopened and ready for review: the check is posted at once, so it exists from the start;
- a finished `check_run` that is one the aggregate waits for (an `expected` id before `/`, or a status context), dropped otherwise after the one cached config read;
- `check_run` `rerequested` on `ci / Required checks` or its shadow (the Re-run button);
- `status` for a context in `statuses` (Codecov's), looked up by the commit's branches.

A failure answers HTTP 500 for the check-run, Re-run and status deliveries, so they show as failed and can be redelivered (the compute is idempotent); a pull request delivery's status is never changed by it. **A burst of finished checks is cheap on purpose** (a pull request ends about forty check runs at once, and several pull requests can do it together, which exhausted the App's GitHub quota the first time it ran live): a finished check the aggregate does not wait for is dropped using the base branch the payload names and the cached config read, before the pull request is read at all; the pull request read is kept for 20 seconds for the same head commit (a push changes the commit, so it is read again); and deliveries for one commit that arrive while it is being computed share the work, which runs once more afterwards (at most three runs in one instance) so a check that finished meanwhile is counted. A failed read now says what GitHub answered (`GitHub GET … → 403 ({"message":"API rate limit exceeded"})`), so a rate limit and a missing permission can be told apart in the log. **Every call to GitHub is logged once** as `githubCall` (`utils/github-call-log/`): the method, the route with its numbers and names folded away, the status and GitHub's own quota headers (`remaining`, `limit`, `reset`, `resource`, `retryAfter`), and, for a 403 or 429, GitHub's message. To see what a day costs, count `githubCall` rows by hour and route in Axiom and read the lowest `remaining`; that is the number to compare with the quota before anyone turns the aggregate on for a repository. Each delivery also logs one `githubDelivery` line when it ends, with its event type, repository, GitHub's delivery id, how many calls it made and how many of them read the config tree (`utils/github-delivery-calls/`, an async context, so a call is counted against the delivery that made it however deep it is); the `githubCall` lines carry the same three fields. Count `githubDelivery` rows by event type to see which events spend the quota, and the percentiles of `calls` for the cost of one delivery. **One config read is shared.** `validateConfig()` costs a GitHub call for every directory and file of the `.holocron/` tree, and one delivery asks for it several times (the feed, the board, the labels, the aggregate); on the first live run with the call log it was 83% of Sentinel's calls. A read of a repo at a ref is therefore reused for 5 minutes (10 minutes for a commit, which never changes), concurrent callers share the read in progress, a GitHub failure is never kept, and `validateConfig({ fresh: true })` reads again: the property sync on a push to the default branch does, because it writes from the result. In `on` mode, when it has recently finished a real check (a verdict, not `pending`), Sentinel runs the `#prs` feed and the board's status for it **in the same invocation**, as if GitHub had delivered the completed check run, instead of waiting for GitHub to deliver its own `check_run` back (not verified to happen). A commit where the Actions job already posts `ci / Required checks` is left alone (`foreign`): a check run belongs to the app that posted it, so Sentinel never updates the Actions job's.

**The quota reserve.** The aggregate, the feed, the board and the area labels only report; the checks that gate a merge
(DCO, commits, config, formatting, markdown, editorconfig, specs, docs) must always post. Sentinel remembers the quota
each of the installation's own calls reports (`x-ratelimit-remaining`, `utils/github-quota/`), and below
`QUOTA_RESERVE` (1,500) it answers a finished check run, a Re-run, a status, a feed-only delivery or an issue's area
labels with `handled: false` and runs only the gating checks of a pull request, until the window resets. The first
shadow run used the whole 5,000 in 28 minutes and no DCO check was posted for anyone; with the reserve, a burst of
reporting can no longer do that. It is best effort: an instance knows only what its own calls reported, and a fresh one
has seen none. The derived `expected` list is kept 30 minutes (`AGGREGATE_CHECKS_TTL_MS`, was 5): in that run 95 cold
config reads (about 18 calls each) were 47% of the leaf checks' calls.

**Human steps, not done by the change:**

1. **Subscribe the App to `status` and give it Commit statuses: read.** `github-app.manifest.json` lists both (`status` event, `statuses: read`), but the manifest drives only a new App. On each existing App (dev, then prod) a person edits the App's settings and an owner accepts the new permission; `holocron doctor github-app` reports the drift until then.
2. Set `SENTINEL_CI_AGGREGATE=shadow` on the **dev** instance first (the `Sentinel` 1Password Environment, `holocron sync secrets`), then on prod after the agreement criterion of the spec (20 consecutive pull requests agree on dev; `holocron doctor ci --shadow` reports it).
3. **Only for the flip (phase 9, not part of this stack):** deploy Sentinel with `SENTINEL_CI_AGGREGATE=on` _before_ the pull request that sets `ci.aggregate: sentinel` merges, back to back and not during a Sentinel deploy; the flip pull request's own head has the setting, so it is the first to test the live path. Rolling back is a revert of that pull request.
4. Deploy, then watch `ci / Required checks (sentinel)` beside `ci / Required checks`.

Not verified: that GitHub delivers `check_run` events for runs another app created to this App, and for its own, and that a check run created through the API shows Re-run and sends `rerequested`. The shadow on the dev instance is where that is learned.

### Area labels (optional)

Sentinel adds `area:<name>` labels to pull requests and issues (`.notes/tech-github-area-labels.spec.md`, holocron#2430, rollout item 3). It runs on `pull_request` (opened, reopened, a push, and an edit that changed the title) and on `issues` (opened, and an edit that changed the title). The declaration is `repo.labels` of the repository's **own** default-branch config (`.holocron/repo.ts` here): `areas` maps an area name to folder patterns and `scopes` maps a title scope (`feat(sentinel)`) to an area. A pull request's labels come from its changed files, read from the API (`pulls.listFiles`, never the webhook payload); an issue has no files, so its labels come from the title's scope.

The rules, in order: a pull request's file areas come first, the most-changed folder first, then the areas its title's scopes add; an item carries at most four `area:` labels, counting the ones a person put there, and a wanted label the cap leaves out is logged as `dropped`. It is add-only: it never removes a label, and it never makes one, because GitHub would create a label named in an add request with a default colour. A wanted label the repository lacks is logged as a warning (`missing`; `holocron setup` makes the declared ones). A closed item and a delivery a bot caused (`sender.type` is `Bot`) do nothing. It needs no secret and no setting of its own: a repo that declares no `repo.labels.areas` gets a quiet `skipped`, and a failure is logged and never changes the delivery's status.

The App needs the existing `Issues: Write` and `Pull requests: Write` permissions (adding a label is `POST /issues/{n}/labels`; both are already in `github-app.manifest.json`) and the `issues` event, which is new: subscribe the App to **Issues** by hand on an App that already exists (a dev instance registered from the manifest gets it from `default_events`). Without the subscription the pull request half works and the issue half never runs. Production Sentinel is down (#1100), so this runs only on the dev instance until it is back.

### Private key

Generate one from the App's settings page after creation — that's
`SENTINEL_GITHUB_APP_PRIVATE_KEY`, also destined for the 1Password Environment of the
`prod` layer. Generating a new key at any point invalidates the previous
one, so only do this once and store the result immediately.

### After registration

Both secrets (`SENTINEL_WEBHOOK_SECRET`, `SENTINEL_GITHUB_APP_PRIVATE_KEY`) plus
the App id (`SENTINEL_GITHUB_APP_ID`, shown on the App's settings page) go into
the `prod` layer 1Password Environment first (made by hand: `op` cannot create
one) — see `holocron.config.ts` in this directory for the `vault` provider
wiring — then out to Vercel's env vars. Axiom is one dataset per service (the CLI, Sentinel and Comlink each
have their own) and one shared org slug. Sentinel's Environment holds the Axiom log-shipping and link values
(holocron#780): `SENTINEL_AXIOM_INGEST_TOKEN` (a narrower-scoped, ingest-only token — deliberately not the same
credential as any broader `AXIOM_TOKEN` used elsewhere in this org), `SENTINEL_AXIOM_DATASET` (`holocron-sentinel`)
and `HOLOCRON_AXIOM_ORG` (`the-holocron-7bbe`). The last two are not secrets, but they are synced the same way so there is one
source of truth. They used to be copied to organization Actions variables and an org secret for the dispatched check workflow; Sentinel no longer dispatches it (#2263), so the sync writes them to Vercel only. The logger
and the check runs' Axiom `details_url` read the same two names at request time (`SENTINEL_AXIOM_DATASET`, `sentinelAxiomDataset()`, and `HOLOCRON_AXIOM_ORG`; the bare names of an Environment synced before the rename are covered by the sentence above); with either unset the check run has no details link.

**Error tracking** (holocron#1045). Sentinel reports an exception that a check or the handler caught to its own Sentry
project, through `SentrySink` behind the `ErrorSink` interface of `@theholocron/observability/errors` (no `@sentry/node`
import in Sentinel's source; the package is a dependency only so the deploy installs the peer the sink needs). The one
variable is `SENTINEL_SENTRY_DSN` (`resolveErrorSink()`, `src/utils/sentry-config/`), read through
`@theholocron/env-utils/lookup`. Unset, nothing is sent and nothing is initialised (a `NoopErrorSink`), as in tests and
before the secret is synced; the CLI's `HOLOCRON_SENTRY_DSN` / `SENTRY_DSN` and its shipped key are not read. Every
check's soft-skip `catch` in `handler.ts` logs the failure (Axiom) and reports it (`errors.capture()`), so one failing
check is seen without stopping the others, and `handleWebhookRequest()` flushes the reporter in its `finally`, next to
`logger.flush()`, so Vercel freezing the function does not drop the event. `createErrorReporter()`
(`src/utils/error-reporter/`) makes the sink on the first error and again after each flush, because `SentrySink.flush()`
closes the Sentry client and a warm instance would otherwise drop every later error. The environment name is
`HOLOCRON_ENVIRONMENT` (default `production`), the release is `sentinel`, and events are scrubbed of token-shaped
strings. `SENTINEL_SENTRY_DSN` reaches Vercel with the rest: the `SENTINEL_` prefix of the `repo.secrets.deploy` entry
in `holocron.config.ts` already covers it.

To turn it on (by hand): create a Sentry project for Sentinel, copy its DSN, store it as `SENTINEL_SENTRY_DSN` in the
`prod` layer 1Password Environment (`theholocron/holocron - prod`), run the `sync secrets` command above, then redeploy.

```sh
holocron sync secrets --env prod --cwd apps/sentinel --project-id sentinel --target production
```

**CI-triggered, too** (holocron#800) — the `sync-secrets` task
(`.github/workflows/ci.sync-secrets.yml`, generated) runs the same invocation
via `gh workflow run ci.sync-secrets.yml`
(`workflow_dispatch` only, never automatic — matches "run once after
registration, again only when a secret rotates" below). It needs no GitHub
token: the sync writes to Vercel only (it used to write one org secret too, with a
`HOLOCRON_SECRETS_TOKEN`, #2263). The 1Password side would be a service account that can read the
`prod` layer Environment, but the repo's `HOLOCRON_OP_SERVICE_ACCOUNT_TOKEN` is not one: it is the scheduled
`doctor-tokens` account and reads the `ci` Environment only, so that a job nobody watches cannot read production
secrets. Run this sync locally, as above, signed in to 1Password on your machine; the workflow reads `prod` only
if you give it an account that can.

- **`--target production` only, deliberately still one target.**
  `deploy-preview` (holocron#1010/#1022/#1024/#1028) now gives
  every PR to this whole repo — not only ones touching Sentinel, since
  the thin caller's `pull_request: {}` trigger carries no path filter
  — its own Vercel preview deployment, built from that PR's own,
  not-yet-reviewed code. `sync secrets`'s `deployment` destination now
  sends only the keys `repo.secrets.deploy` names in this config (the
  `SENTINEL_` prefix and `HOLOCRON_AXIOM_ORG`, `HOLOCRON_DISCORD_BOT_TOKEN`,
  `HOLOCRON_USER_SYNC_TOKEN`, #2061), but that is still every runtime key —
  passing `--target preview` would sync **all of them** to
  Vercel's preview environment, `SENTINEL_GITHUB_APP_PRIVATE_KEY` included. A PR
  that adds one line reading and exfiltrating that env var would hand
  an attacker the ability to fully impersonate this GitHub App across
  every org/repo it's installed on — sourcery review caught this on
  the PR that would have added `--target preview`, before it shipped.
  `handleWebhookRequest` (`src/handler/handler.ts`) returns 405 on
  anything but `POST` before it ever reads `env` at all, and the
  preview-deployment monitoring check only ever sends a `GET` — so the
  preview function has no actual use for any of these 5 secrets in the
  first place. Same class of exposure #1057/#1058 closed for the
  Vercel Deployment Protection bypass secret, applied here to
  the production credentials instead: keep them out of a
  PR-controlled deploy target entirely, rather than narrow what's
  synced there.
- **`--github-secret`/`--github-secret-scope`.** Of the 5 runtime keys,
  only `SENTINEL_AXIOM_INGEST_TOKEN` ever had a GH Actions consumer
  (`theholocron/.github`'s dispatched-check workflow, which Sentinel no
  longer dispatches, #2263), at **org** scope. Nothing reads it now: the
  sync still writes it, and dropping the org secret and these two flags is
  a separate step. Omitting the flags would push every key as a pointless
  repo secret on `holocron` instead (nothing there reads them).
- **`--token github=$(gh auth token)`.** None of holocron's own
  provisioned GitHub tokens (`docs/tokens.md`, repo root) carry the
  org-level Secrets permission this write needs — `github.admin` is
  repo-scoped, `github.org` doesn't include it. Your own `gh` CLI
  session already has it (it's almost certainly how this org secret
  was first set) — reuse it inline rather than provisioning a new
  token for one recurring write.
- **Manual, on-demand — not part of `deploy`.** Run it once
  after registration, and again only when a secret actually rotates.
  Wiring it into every recurring deploy would re-push unchanged
  secrets on every `deploy` run for no reason.
- **Vercel snapshots env vars at deploy time** — a running deployment
  doesn't pick up a sync until the next deploy. Run
  `pnpm run deploy` right after syncing if the App needs the
  new value immediately, not on its next unrelated deploy.
- Only the Environment's own variables cross over: nothing is added to it
  by the vault (Doppler injected `DOPPLER_*` bookkeeping keys that had to be
  filtered; a 1Password Environment has none).

## Local development instance

Vercel is not needed to try a change against real GitHub events. A development instance is a second GitHub App
(`The Holocron Sentinel - dev`) whose webhook reaches this machine through a named tunnel, with its secrets in
the `dev` layer 1Password Environment (`<org>/<repo> - dev`).

```bash
# once: the dev App, from the same manifest as production (one click on GitHub; the id, key and webhook secret
# go to a private .credentials file to import into the `dev` layer Environment)
holocron new github-app --cwd apps/sentinel --org theholocron \
  --name "The Holocron Sentinel - dev" \
  --webhook-url https://sentinel-dev.theholocron.dev/api/webhook \
  --manifest github-app.manifest.json

# every time: the handler, the tunnel and the Environment's variables, in one terminal (Ctrl-C stops both)
pnpm --filter @theholocron/sentinel dev
```

`pnpm dev` is [`holocron dev`](/holocron/commands/dev/), configured by the `dev` block of this directory's `holocron.config.ts` (the Environment, the tunnel's name and hostname, the port and the command, so the hostname is set in one place): it sets up the named tunnel and its DNS record the way
`holocron new tunnel` does (nothing changes when they are already right), reads the variables of the `dev` layer in
memory, and runs the handler (`dev.serve`, served by `holocron dev serve`) beside `cloudflared` with those variables and `PORT` in the application's
environment. Nothing is written to disk and no value is printed. Needs a Cloudflare token with Cloudflare Tunnel:
Edit, and `cloudflared` (`brew install cloudflared`).

The application sees only the variables of the `dev` layer's Environment (`dev.layer`), not those of another layer. A feature that is off until a variable is set (role sync, the `#prs` feed) needs that variable in
that Environment: `SENTINEL_ROLE_SYNC_REPO` and `HOLOCRON_DISCORD_BOT_TOKEN` for the feed, plus `HOLOCRON_USER_SYNC_TOKEN`
for role sync. A feature that stays quiet is not broken: Sentinel logs why, as
`runPrFeed: finished … status: skipped, reason …`.

`holocron dev serve` alone runs only the handler on `127.0.0.1`, serving `/api/webhook` (the path Vercel
serves). Its three required variables, `SENTINEL_GITHUB_APP_ID`, `SENTINEL_GITHUB_APP_PRIVATE_KEY` and `SENTINEL_WEBHOOK_SECRET`, come
from the process, or else from the Environment `dev.layer` names (`dev`), read with
`op` so Touch ID asks once. `PORT` changes the port. Each request is logged as one line (method, path, status), never a
header or a payload. The handler's own logs ship to Axiom only if that Environment sets `SENTINEL_AXIOM_INGEST_TOKEN`
and `SENTINEL_AXIOM_DATASET`, or leave both out. It says which it is on start. Use the same dataset as production
(`holocron-sentinel`) with an ingest token of its own, scoped to that dataset: `holocron dev` sets
`HOLOCRON_ENVIRONMENT=development` (and `ENVIRONMENT`), so every line carries `env: "development"` and the service's one dataset holds dev and production
(`where env == "development"`); production sets `HOLOCRON_ENVIRONMENT=production` (or the older `ENVIRONMENT=production`) in the `prod` layer Environment. Install the dev
App only on the repositories you test with.

### Sending a delivery by hand

`api/webhook.collection.json` and the `api/webhook.environment*.json` files, beside `api/webhook.mjs` and kept out of the deploy by `.vercelignore`, are a collection of requests and its environments.
The way to send one is `pnpm exec holocron open requests` (quit Bruno first): it reads `SENTINEL_WEBHOOK_SECRET` from the
1Password Environment of each layer you name into a private file that lasts until Bruno quits, so nothing is pasted.
The default is `dev` alone (`--environment dev,local` adds local; `prod` only when you write `--environment prod`), and
each Bruno environment (`Sentinel (local)`, `(dev)`, `(prod)`) uses its own layer's secret. Picking a layer you did not
load fails with `variables could not be resolved: process.env.PROD_SENTINEL_WEBHOOK_SECRET`: start again with that layer. `webhookSecret` is a secret-type variable the request files leave empty (they are shared
with Postman); the committed `.bruno/` workspace refers it to that entry (`secretRefs` in `holocron.config.ts`). In
another API client, pick an environment and put that instance's webhook secret in `webhookSecret` by hand. A
pre-request script signs each body as sent (`X-Hub-Signature-256`). There are three environments, one file each:

| Environment        | File                            | `baseUrl`                              | What it is                                                                                   |
| ------------------ | ------------------------------- | -------------------------------------- | -------------------------------------------------------------------------------------------- |
| `Sentinel (local)` | `webhook.environment.json`      | `http://127.0.0.1:3000`                | The instance on this machine, what `holocron dev serve` listens on                           |
| `Sentinel (dev)`   | `webhook.environment.dev.json`  | `https://sentinel-dev.theholocron.dev` | The same instance through its named tunnel (`dev.tunnel`), reached the way GitHub reaches it |
| `Sentinel (prod)`  | `webhook.environment.prod.json` | `https://sentinel.theholocron.dev`     | The deployed App. Its webhook secret is the production one, not the dev App's                |

Use `Sentinel (prod)` with care: the `Rejected` and `Signed, no effect` folders are harmless there, but `Signed, acts on
GitHub` runs the real checks and posts as the production App on the repository you name, so leave that folder alone
unless you mean it.

The folders go from harmless to acting:

- **Rejected** is a GET, a POST with no signature and a POST with a wrong one: 405, 401, 401, and nothing is read.
- **Signed, no effect** is a `ping`, a push to a non-default branch and an `installation` `created`: Sentinel answers
  without a GitHub call, a check or a comment.
- **Signed, acts on GitHub** is a `pull_request` `opened`: it runs every check on the pull request named by `repo`,
  `pullNumber` and `installationId`, with the App's installation token, and posts the check runs, comments and the
  `#prs` feed. Use a sandbox repository the dev App is installed on.

`src/requests/requests.test.ts` runs the collection's signing script against `parseWebhookEvent()`, so the two cannot
drift apart.

`holocron sync tooling --cwd apps/sentinel` pushes the files through the `tooling` provider (`providers.tooling` in
`holocron.config.ts`): its workspace is made when it is missing, the collection is replaced in place and each
environment is made or updated, keeping a `webhookSecret` set there. Add `--dry-run` to see the step first. It runs nothing else this
config declares (`holocron setup` would also run the Vercel domain and DNS steps).

The two JSON files are the one source. A tool that reads another format gets it generated:
`holocron export requests --to bruno --cwd apps/sentinel` writes `webhook.bruno.json` (the requests and the three
environments in one file, which Bruno imports) into the git-ignored `api/.export/bruno/`
(`--dry-run` converts and lists without writing).

## Development

| Script               | Description                                 |
| -------------------- | ------------------------------------------- |
| `pnpm run build`     | Bundle with tsdown                          |
| `pnpm run test:unit` | Run the vitest suite (always with coverage) |
| `pnpm run typecheck` | `tsc --noEmit`                              |
| `pnpm run lint:code` | ESLint                                      |

## Releases

Automated via semantic-release. See [CHANGELOG.md](../../CHANGELOG.md).

## Documentation

<https://docs.theholocron.dev/holocron/>
