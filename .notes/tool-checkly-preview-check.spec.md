---
status: accepted
issue: theholocron/holocron#1010
blocked-by: []
related:
  - theholocron/holocron#996
  - theholocron/holocron/decisions/0013-checkly-monitoring-holocron-plugin.md
---

# Per-PR preview monitoring check

Extends the Checkly uptime monitoring (#996, ADR-0013) to run the same
check definitions against a PR's Vercel preview deployment, not only
production — so a breaking change is caught before merge, not after.

## Problem

Sentinel's two Checkly checks (uptime, signature verification) watch
`sentinel.theholocron.dev` on a schedule. Nothing runs them against a
PR's preview deployment before merge — a regression is only caught
once it's already live in production.

## Considered options

1. **Checkly's native Vercel marketplace integration** — zero code,
   but a parallel, UI-managed system holocron's config has no
   visibility into; bypasses the capability/provider pattern every
   other integration in this org follows.
2. **GitHub Actions step running `checkly test` against the preview
   URL** — reuses Checkly directly, but requires maintaining a
   separate checks-as-code file parameterized by URL (Checkly's CLI
   test-against-arbitrary-URL feature only works with checks-as-code,
   not REST-managed checks), duplicating the assertions already in
   `holocron.config.ts`.
3. **A new vendor-neutral local evaluator, reusing the existing
   `monitoring.checks` config directly** — runs the same
   `MonitoringCheckInput`/`MonitoringAssertion` definitions already in
   `holocron.config.ts` via a plain HTTP request, overriding `url`
   with the preview deployment's URL. No vendor API call, no
   duplicated check definitions, no new config surface.

Chosen: **option 3**. It's the only option with a single source of
truth for the check definitions (the existing `holocron.config.ts`),
and it needs nothing from Checkly's platform at all for this
ephemeral, per-PR use — Checkly's own dashboard/alerting stays
reserved for the persistent production checks.

## Design

### Vendor-neutral evaluator (`packages/cli`)

A new, standalone function — no plugin, no vendor API — that takes a
`MonitoringCheckInput` and an optional URL override, performs the HTTP
request, and evaluates each `MonitoringAssertion` locally:

- `status_code` → response status (as a string)
- `response_time` → measured latency in ms
- `body` → response text
- `header` → `response.headers.get(property)`

against the six existing comparisons (`equals`/`not_equals`/
`contains`/`not_contains`/`greater_than`/`less_than`). Mirrors
Checkly's own platform behavior for `shouldFail`: a response status
`>= 400` is an automatic failure unless `shouldFail: true`, same as
documented in ADR-0013. A transport-level error (network failure,
timeout) is always a failure regardless of `shouldFail`.

This reuses the exact same `MonitoringAssertionSource`/
`MonitoringAssertionComparison`/`MonitoringAssertion`/
`MonitoringCheckInput` types from `packages/cli/src/plugin/
capabilities.ts` — only the _vocabulary_, since no comparison logic
exists anywhere in this codebase today (Checkly's API evaluates
assertions server-side; there was nothing to extract).

### CLI command: `holocron monitoring check <url>`

New top-level noun (`monitoring`), mirroring the capability name the
way `secrets`/`deploy`/`sync` already mirror theirs. Loads the
workspace's `monitoring` provider (via the standard `workspace`
execution context + `assertPluginsResolvable`, same as every other
workspace command) purely to read its `.checks` config — never calls
a vendor API method. Runs every configured check against `<url>`
instead of its own configured `url`, prints pass/fail per check and
per failing assertion, exits non-zero if any check fails.

Required positional (`url`) → gets a `COMMAND_REGISTRY` entry for
interactive prompting, and a `COMMAND_CONTEXTS["monitoring check"] =
"workspace"` entry, same conventions every other command follows.

### Task: `delivery.previewCheck`

Three parallel registry entries (`packages/astromech/src/registry.ts`'s
`TASKS`, `github-action-thin-callers.ts`'s `WORKFLOW_TEMPLATES`,
`github-action-reusable-workflows.ts`'s `REUSABLE_WORKFLOWS`), all
keyed `"delivery.previewCheck"` — the normal task-registration shape,
**not** `delivery.deploy`'s `with: { on: "release" }` pattern (that's
an exception astromech explicitly skips generating a workflow for;
confirmed by reading `astromech.ts`'s own skip-guard and its test).
`local: null` in the task registry — there's no local equivalent,
since it needs a live preview URL that only exists once Vercel has
actually deployed it, same shape as `delivery.bundleSize`.

Gating to only packages with monitoring configured is by convention,
not cross-checked: astromech has no visibility into capabilities at
all (that's a `packages/cli`-only concept) — a package only adds
`delivery.previewCheck` to its own `tasks:` array when it actually has
a `monitoring` provider with checks, same as how a package only opts
into `delivery.deploy`'s release-deploy behavior today.

**Correction, found while wiring up Sentinel itself (the first real
consumer)**: that convention only works for a repo whose own root
`holocron.config.ts` carries the task — `holocron repo sync`'s
thin-caller write is relative to `--cwd`, not the actual git repo
root, so it's useless for a _monorepo sub-package_ (confirmed live: a
real `repo sync --cwd packages/sentinel` wrote a whole parallel,
GitHub-invisible `.github/` tree inside `packages/sentinel/` instead
of this repo's real root `.github/workflows/` — tracked as its own
tool bug, #1014). Sentinel's `holocron.config.ts` does **not** carry a
`delivery.previewCheck` entry as a result; instead
`.github/workflows/sentinel.previewCheck.yml` is hand-maintained, same
pattern as the two Sentinel-specific workflows that already existed
before this feature (`sentinel.deploy.yml`, `sentinel.secretsSync.yml`)
for the identical reason. It calls the exact same reusable
`delivery.previewCheck.yml` a normal (non-monorepo) repo's generated
thin caller would — the task/thin-caller/reusable-workflow
registration below is still correct and still the right path for any
other repo; Sentinel can't reach it through the automatic one, though.

### Trigger: `deployment_status`

The thin-caller template (`packages/astromech/src/templates/
workflows/delivery.previewCheck.yml`) is fully static — no per-package
templating needed, since the preview URL comes from the triggering
GitHub event, not from `holocron.config.ts`:

```yaml
on:
  deployment_status:

jobs:
  preview-check:
    if: >-
      github.event.deployment_status.state == 'success' &&
      github.event.deployment.environment == 'Preview' &&
      github.event.deployment_status.environment_url != ''
    uses: theholocron/.github/.github/workflows/delivery.previewCheck.yml@main
    with:
      preview-url: ${{ github.event.deployment_status.environment_url }}
      sha: ${{ github.event.deployment.sha }}
```

The reusable `workflow_call` implementation
(`templates/reusable/delivery.previewCheck.yml`) takes `preview-url`
and `sha` as required inputs (plus an optional `cwd`, default `.`),
checks out `sha` explicitly with `persist-credentials: false` (this
job runs a PR's own, untrusted `holocron.config.ts` — nothing should
be left in `.git/config` for it to read), then runs `holocron
monitoring check <preview-url>` through the shared `holocron`
composite action, same as every other reusable workflow's core step.
No `secrets: inherit` on either caller — this job makes no vendor API
call, so there's nothing it needs to inherit.

No live precedent exists in this org for a thin caller triggered by a
true external webhook event rather than `push`/`pull_request`/
`schedule`/`workflow_dispatch` — a `release:`-triggered workflow
existed once (`.github`'s now-superseded `post-release.yml` fossil,
confirmed in the live `.github` checkout) and proves the generator/
`on:` plumbing already tolerates it; this is the first _current_
instance.

### Correction: `deployment_status` never fires for Sentinel on its own

The design above assumed Vercel's native GitHub App integration would
create the `deployment_status` event, the same way it does for any
normally git-linked Vercel project. Checked live, by reading
`holocron-plugin-vercel`'s deployment capability
(`packages/holocron-plugin-vercel/src/capabilities/deployment.ts`):
`triggerDeployment()` (the git-branch path) explicitly throws when the
Vercel project has no linked GitHub repo (`"...cannot trigger a
deployment. Link the repo first."`). Sentinel deploys through the
_other_ path, `deployFunction()` — a bare file upload, no git link,
precisely because it ships as an npm package with no buildable git
history Vercel could track (see `delivery.deploy`'s own comment in
`packages/sentinel/holocron.config.ts`). A file-uploaded deployment
never goes through Vercel's GitHub App, so it never creates a GitHub
Deployment object, and `deployment_status` never fires — the whole
mechanism above would sit dead for Sentinel specifically, regardless
of any dashboard setting, until a PR happened to also get a
git-linked Vercel preview from somewhere else.

**Fix: synthesize the event ourselves**, instead of depending on
Vercel's GitHub App. Precedent already exists in this exact repo:
`templates/reusable/preview.yml` (the docs/Storybook-on-Cloudflare-
Pages preview flow) deploys via `wrangler`, then manually creates a
GitHub Deployment + `deployment_status` via `gh api` with the real
preview URL, purely so other tooling watching that event sees it.
Same move here, hand-maintained (same non-astromech-templated
category as `sentinel.deploy.yml`/`sentinel.previewCheck.yml` — this
operation is monorepo-subpackage-specific, same #1014 reason):

`.github/workflows/sentinel.previewDeploy.yml` — triggers on
`pull_request` (default types: opened/synchronize/reopened), paths
`packages/sentinel/**`. Checks out the PR's exact head SHA (not the
default `pull_request` merge-commit checkout — same category of
checkout-ref gotcha as the reusable workflow's own `sha` input
above), runs the new `deploy:preview` package script (`delivery.build`
→ `stage-deploy.mjs` → `holocron deploy --files .vercel-deploy
--project-id sentinel`, i.e. `delivery.deploy` minus
`--target production`, so it defaults to a preview deploy), captures
the resulting URL from the CLI's own stdout (`runDeployFromFiles`
already waits for `ready` and prints the bare URL on success — no
`--json` flag exists, so this greps the last `https://` match out of
the captured output), then `gh api` two calls: `POST
/repos/.../deployments` with `ref` = the PR head SHA,
`environment: "Preview"`, `required_contexts: []` (skips GitHub's
default wait-for-other-statuses behavior, which would hang forever
here — same field `preview.yml` already sets for the same reason),
then `POST .../deployments/{id}/statuses` with `state: success` and
`environment_url` = the captured URL. The already-merged
`sentinel.previewCheck.yml` (triggered by `deployment_status`, filters
on `environment == 'Preview'` and a non-empty `environment_url`) picks
this up exactly as if Vercel's own integration had produced it —
**zero changes to that workflow, the reusable `delivery.previewCheck.yml`,
or the `monitoring check` CLI command**; this only replaces who creates
the event.

`VERCEL_TOKEN`/`GITHUB_TOKEN` exposure on a `pull_request`-triggered
job is the standard, intentional GitHub behavior: a `pull_request` run
(as opposed to the dangerous `pull_request_target`) only gets
repository secrets when the PR is from a branch on this repo, not a
fork — a malicious fork PR modifying `scripts/stage-deploy.mjs` to
exfiltrate `VERCEL_TOKEN` simply never receives it. No cleanup job —
`holocron deploy cleanup-preview` exists but is interactive
(`@inquirer/prompts checkbox()`) and hardcodes the Cloudflare
branch-alias naming convention (`${repo}-pr-${number}`) `preview.yml`
uses; making it CI-safe and Vercel-aware is its own follow-up, not
bundled here. Stale preview deployments accumulate until someone
prunes them from the Vercel dashboard — acceptable for now given low
PR volume on this package.

## Open risks

- **Unverified: does a `deployment_status`-triggered workflow run
  actually post as a GitHub check on the PR's commit?** A code
  review on #1015 claimed `deployment_status` runs are associated
  with the default-branch SHA, not the deployed commit — checked
  against GitHub's own docs directly: `GITHUB_SHA` for this event is
  documented as "Commit to be deployed," not the default branch,
  contradicting that specific claim. What IS real and already handled
  (the reason `sha`/`ref` are explicit inputs at all): GitHub evaluates
  _which version of the workflow file itself_ to run from the default
  branch for this event type (same as `schedule`/`workflow_dispatch`),
  and `actions/checkout` defaults to that same ref absent an explicit
  override — a different concern from what the run's own `GITHUB_SHA`
  resolves to. Whether the resulting check genuinely surfaces on the
  PR's own Checks tab (the part that would matter for a future
  `required` check) is still unconfirmed either way — needs a real
  preview deploy to settle. Deliberately not `required` yet for
  exactly this reason (see the `delivery.previewCheck` section above).
- **`environment_url` presence (resolved for Sentinel)**: no longer
  depends on Vercel's own GitHub integration setting it — see the
  "Correction" section above. `sentinel.previewDeploy.yml` sets it
  itself from the CLI's own captured deploy URL, so it is always
  non-empty by construction for Sentinel's case. Still a real
  consideration for any _other_ repo that opts into the generic,
  astromech-templated `delivery.previewCheck` task and genuinely relies
  on Vercel's native integration (no fallback if Vercel omits it —
  `target_url` was deliberately rejected as a fallback per an earlier
  review finding: it can point at a deployment-details page instead of
  the live app).
- **New: URL scraped from CLI stdout, not a structured output.**
  `sentinel.previewDeploy.yml` greps the last `https://` match out of
  `holocron deploy --files`'s captured output — there's no `--json`
  flag on that command. Fragile if the CLI's success-line format ever
  changes; the step fails loudly (`::error::` + non-zero exit) if no
  URL is found, rather than silently posting an empty
  `environment_url`.
- **New: no automated cleanup of Sentinel's preview deployments.**
  Each PR touching `packages/sentinel/**` leaves a Vercel preview
  deployment behind indefinitely. See the "Correction" section above —
  `deploy cleanup-preview` isn't CI-safe or Vercel-aware yet.
- **Checkout credential exposure (code review on #1015, fixed)**: the
  reusable workflow checks out and runs a PR's own, untrusted
  `holocron.config.ts`. `actions/checkout` now sets
  `persist-credentials: false` — nothing left in `.git/config` for
  that code to read and exfiltrate — and the thin callers no longer
  carry `secrets: inherit`, since nothing in this job needs any
  secret in the first place.
