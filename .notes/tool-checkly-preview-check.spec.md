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
consumer), now fixed**: this convention originally only worked for a
repo whose own root `holocron.config.ts` carries the task —
`holocron repo sync`'s thin-caller write was relative to `--cwd`, not
the actual git repo root, so it silently broke for a _monorepo
sub-package_ (confirmed live: a real `repo sync --cwd
packages/sentinel` wrote a whole parallel, GitHub-invisible `.github/`
tree inside `packages/sentinel/` instead of this repo's real root
`.github/workflows/`). Fixed at the root — `findGitRoot()`
(`packages/cli/src/utils/find-git-root.ts`) resolves the real git root
independently of `--cwd`, and every repo-wide write in `sync.ts`
(workflow files, the `properties` step's monorepo/stack detection) now
targets it. Sentinel's `holocron.config.ts` carries
`delivery.previewCheck` (and `delivery.previewDeploy`, below) exactly
like any other package would — no hand-maintained workflow file
needed for either.

A first attempt at working around this bug (before the real fix
above landed) hand-wrote `.github/workflows/sentinel.previewCheck.yml`
and `sentinel.previewDeploy.yml` directly, matching the pre-existing
`sentinel.deploy.yml`/`sentinel.secretsSync.yml` precedent for
genuinely Sentinel-specific operations. That precedent doesn't apply
here — the preview-check/deploy logic is generic (any package with a
`monitoring` provider and a Vercel preview could use it), so once the
underlying bug was fixed directly, hand-maintaining the files was
never the right call for this case specifically; both are now
generated and synced like every other task's workflow.

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
and `sha` as required inputs (plus an optional `cwd`, default `.`).
**Before anything else** (review on #1024), it validates `preview-url`:
the triggering `deployment_status` event's `environment_url` is set by
whoever created that deployment status — not necessarily this repo's
own `delivery.previewDeploy` job, since anyone with `deployments:
write` could create one directly via the API — so forwarding it
unchecked to a step that fetches it (the monitoring check, below) is
a fundamental technique used in an SSRF attack: a crafted `environment_url` could point this
runner at an internal server instead of a real Vercel preview. Fixed the
same way `delivery.previewDeploy`'s own URL-extraction step already
is: `new URL(candidate).hostname` must end in `.vercel.app` and
`.protocol` must be `https:`, checked via `node -e`, and the
_re-serialized_ `url.href` — never the raw input — is what gets
forwarded on. Re-serializing closes a second, smaller issue the same
move: a string that fails to parse as a conforming URL can't carry
embedded spaces or shell metacharacters either, so there's nothing
for argument injection to land in by the time it reaches `args:`.

Only once that validation step passes does it check out `sha`
explicitly with `persist-credentials: false` (this job runs a PR's own,
untrusted `holocron.config.ts` — nothing should be left in
`.git/config` for it to read), then runs `holocron monitoring check
<validated-url>` through the shared `holocron` composite action, same
as every other reusable workflow's core step. No `secrets: inherit` on
either caller — this job makes no vendor API call, so there's nothing
it needs to inherit.

No live precedent exists in this org for a thin caller triggered by a
true external webhook event rather than `push`/`pull_request`/
`schedule`/`workflow_dispatch` — a `release:`-triggered workflow
existed once (`.github`'s now-superseded `post-release.yml` fossil,
confirmed in the live `.github` checkout) and proves the generator/
`on:` plumbing already tolerates it; this is the first _current_
instance.

### `deployment_status` never fires for a file-uploaded deploy

The design above assumes Vercel's native GitHub App integration
creates the `deployment_status` event, the way it does for a normal
git-linked project. Checked live, by reading `holocron-plugin-vercel`'s
deployment capability (`packages/holocron-plugin-vercel/src/
capabilities/deployment.ts`): `triggerDeployment()` (the git-branch
path) explicitly throws when the Vercel project has no linked GitHub
repo. Sentinel deploys through the other path, `deployFunction()` — a
bare file upload, no git link, since it ships as an npm package with
no buildable git history for Vercel to track. A file-uploaded
deployment never goes through Vercel's GitHub App, so it never
creates a GitHub Deployment object, and `deployment_status` never
fires — confirmed live (`gh run list` empty) before this was fixed.

### Task: `delivery.previewDeploy`

Rather than depend on Vercel's GitHub App, a second task deploys a
preview itself and manually creates the GitHub Deployment +
`deployment_status` with the real preview URL — same move
`theholocron/.github`'s docs/Storybook-on-Cloudflare-Pages preview
workflow (`templates/reusable/preview.yml`) already makes for
Cloudflare, via a plain `gh api` call in a bash step. No new CLI
capability and no new `@theholocron/github-client` module — every
GitHub call from `holocron-plugin-github` itself goes through that
client, but a `gh api` call from inside a GitHub Actions workflow step
is a different thing entirely, already an established pattern here
(`preview.yml`, `sync-github.yml`'s `gh pr merge`), not something that
was ever going to route through a typed capability.

`local: null` — no generic local runner; each consuming package
defines its own `delivery.previewDeploy` script (build → stage →
`holocron deploy --files <dir> --project-id <id>`, i.e. the same
chain as its `delivery.deploy` script minus `--target production`, so
it defaults to a preview deploy), same shape as `delivery.deploy`
itself. The reusable workflow runs `holocron run
delivery.previewDeploy` through the shared `holocron` composite
action — `--cwd` is passed via `args`, which only works because the
composite action's `command:` is set to the literal multi-word string
`run delivery.previewDeploy` rather than `command: run` + `task:
delivery.previewDeploy` — the latter's `args` get a `--` prepended
(delimiting passthrough args to the underlying tool), which would stop
yargs from ever parsing `--cwd` as the global flag it needs to be.

Checks out the PR's exact head SHA (same checkout-ref reasoning as
`delivery.previewCheck`'s `sha` input), and skips the deploy step
cleanly on an empty `VERCEL_TOKEN` (a fork PR never receives it) via a
plain shell check rather than a step `if:` — `secrets` isn't a valid
context there (actionlint-enforced). That skip is silent to the fork
contributor — no preview, no explanation — tracked as **#1027**, not
fixed here.

**Two jobs, not one** (review on #1022): `deploy` checks out and builds
the PR's own code with `VERCEL_TOKEN` present, and `report` — on a
separate, fresh runner, with `deployments: write` and
`HOLOCRON_DEPLOYMENTS_TOKEN`, and **no checkout at all** — creates the GitHub
Deployment and posts its status. Splitting them closes a real
escalation the single-job version had: a malicious build/stage script
in `deploy` could persist a `gh` shim onto `$GITHUB_PATH` (or similar
runner-state tampering) that a later step in the _same_ job — the one
holding the deployments credential — would then execute instead of the
real `gh` CLI, stealing that credential too. Two jobs on two runners
share no state, closing that path entirely. `VERCEL_TOKEN` exposure to
`deploy`'s own build step is unrelated and still open (#1020 below) —
splitting the jobs narrows the blast radius to that one token, not
both.

The preview URL is extracted from the deploy step's log and
**validated by parsing it as a URL**, not only regex-matched: the
first pass anchored a hand-written character class after `.vercel.app`
that happened to include `@`, so a crafted log line like
`https://x.vercel.app@127.0.0.1/` would satisfy the regex while
actually parsing to localhost `127.0.0.1` — a classic userinfo-redirect
trick. Fixed by grabbing any `https://` candidate text and separately
requiring `new URL(candidate).hostname` end in `.vercel.app`, which
can't be fooled by any text-shape trick regex-tuning alone keeps
missing.

`report` posts using `secrets.HOLOCRON_DEPLOYMENTS_TOKEN` (review on
#1024 — renamed from a first-pass `GH_TOKEN` secret that no repo/org
secret of that exact name ever actually provisioned, so `secrets:
inherit` on the thin caller silently forwarded nothing and `report`
failed its own `-z` check every run; `HOLOCRON_DEPLOYMENTS_TOKEN`
matches this org's `HOLOCRON_<FEATURE>_TOKEN` naming and is documented,
with provisioning steps, in `docs/tokens.md`'s "CI-only exception:
GitHub Deployments"), a real PAT, **not** `secrets.GITHUB_TOKEN`:
GitHub does not start a new workflow run for an event created using a
run's own `GITHUB_TOKEN` — the same recursive-run guard this repo's
own sync workflows (`platform.repoSync.yml`, `sync-github.yml`)
already route around with dedicated PATs of their own. Missed on a
first pass at this exact feature — with `GITHUB_TOKEN`, the deployment
and status both post successfully, look entirely correct on the PR,
and `delivery.previewCheck`'s workflow would never start. The
deployment's `ref` is the PR's head **branch**, not its SHA — GitHub's
PR "Environments" widget associates a Deployment by matching `ref` to
the PR's own branch, not by SHA. GitHub resolves `ref` to whatever
commit the branch points to **at creation time**, though — a separate
moment from the `deploy` job's own checkout, which happened up to 20
minutes earlier. **Checked explicitly, not assumed** (review on
#1028): if the PR branch received a new push while this job was still
running, the created deployment's `.sha` would reflect that NEWER
commit, not the one `deploy` actually built and uploaded — silently
mismatching the preview URL (built from the OLD commit) against the
reported commit. Fixed by comparing the created deployment's own
`.sha` (read back via a second `gh api` call) against
`github.event.pull_request.head.sha` — frozen for this run's entire
lifetime regardless of what the branch does meanwhile — and failing
loudly on a mismatch rather than posting a status for the wrong
commit. Safe to fail: `cancel-in-progress: false` means a newer
run for the new commit is already queued or running and will create
its own, correctly-resolving deployment.

Both `gh api` calls retry up to 3 times: deployment **creation** too,
not only the status POST — a transient failure creating the
(cheap) GitHub Deployment object used to fail the whole step outright,
forcing a full re-deploy (re-uploading to Vercel) on retry instead of
retrying the one API call. **Idempotent now** (review on #1028): before
each creation attempt, lists deployments for this `ref`+`environment`
created in the last two minutes and reuses one if found, rather than
creating a fresh one every retry — closes the same class of gap the
status-POST retry already closed (a dropped connection after GitHub
processed the request would otherwise leave the FIRST created
deployment permanently `pending` forever, since nothing would ever
post a status to it, while the retry's second deployment gets the
status instead). The two-minute window is deliberately narrow — wide
enough to cover this job's own ~15-second retry loop, narrow enough
that an older, unrelated deployment for the same branch (a previous
PR push) is never mistaken for this run's own.

The deployment-creation payload is now built with `jq -n --arg`, not a
hand-rolled `printf` string (review on #1028): a branch name
containing a literal double quote — not forbidden by git's or GitHub's
ref-naming rules — would have broken out of the `printf`-constructed
JSON and produced a payload `gh api` couldn't send, silently
losing the deployment report for that PR's preview. `jq --arg` escapes
the value correctly regardless of its content.

Before retrying a status POST, it
checks whether GitHub already recorded success from a prior attempt
whose _response_ got lost client-side (a dropped connection after
GitHub processed the request) — without that check, retrying blindly
risks posting success twice, firing `delivery.previewCheck` twice for
the same preview. If every status-POST retry is exhausted, one last
attempt posts `state: error` rather than leaving the Deployment
permanently `pending` in GitHub's UI.

Four known gaps, tracked rather than fixed here:

- **#1020** — the `deploy` job's build step still runs this monorepo's
  own, PR-affectable CLI build, pre-review (`pull_request` has no
  review gate the way `sentinel.deploy.yml`'s `push: main` does). A
  GitHub `environment:` with required reviewers in front of that step
  is the real fix.
- **#1021** — no automated cleanup of the preview deployments this
  creates; `holocron deploy cleanup-preview` exists but is interactive
  and hardcodes Cloudflare's branch-alias naming, so it isn't CI-safe
  or Vercel-aware yet.
- **#1023** — the thin-caller templates trigger on `pull_request: {}`
  with no `paths:` filter, so a monorepo subpackage consumer (Sentinel)
  gets a real preview deploy + check on every PR in the repo, not only
  ones touching its own files.
- **#1027** — a fork PR's missing `VERCEL_TOKEN` is handled correctly
  (the deploy step skips rather than fails), but silently: no preview,
  no explanation why, despite every same-repo PR getting one.

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
  depends on Vercel's own GitHub integration setting it —
  `delivery.previewDeploy` sets it itself from the real deploy URL, so
  it's always non-empty by construction here. Still a real
  consideration for any _other_ repo that relies on Vercel's native
  integration instead (no fallback if Vercel omits it — `target_url`
  was deliberately rejected as a fallback per an earlier review
  finding: it can point at a deployment-details page instead of the
  live app).
- **New: preview URL scraped from a log file, not a structured
  output.** `delivery.previewDeploy`'s reusable workflow greps the
  holocron composite action's own `log-file` output for the last
  `*.vercel.app` match — there's no `--json` flag on `holocron deploy`
  to parse instead. Anchored to the Vercel service and a URL-safe
  character class specifically so it can't be redirected to an
  attacker-chosen origin by anything else that log happens to contain;
  fails loudly (`::error::`) rather than posting an empty
  `environment_url` if no match is found.
- **Checkout credential exposure (code review on #1015, fixed)**: the
  reusable workflow checks out and runs a PR's own, untrusted
  `holocron.config.ts`. `actions/checkout` now sets
  `persist-credentials: false` — nothing left in `.git/config` for
  that code to read and exfiltrate — and the thin callers no longer
  carry `secrets: inherit`, since nothing in this job needs any
  secret in the first place.
