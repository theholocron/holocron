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
      github.event.deployment.environment == 'Preview'
    uses: theholocron/.github/.github/workflows/delivery.previewCheck.yml@main
    with:
      preview-url: ${{ github.event.deployment_status.environment_url }}
    secrets: inherit
```

The reusable `workflow_call` implementation
(`templates/reusable/delivery.previewCheck.yml`) takes `preview-url`
as a required input, runs `holocron monitoring check <preview-url>`
through the shared `holocron` composite action, same as every other
reusable workflow's core step.

No live precedent exists in this org for a thin caller triggered by a
true external webhook event rather than `push`/`pull_request`/
`schedule`/`workflow_dispatch` — a `release:`-triggered workflow
existed once (`.github`'s now-superseded `post-release.yml` fossil,
confirmed in the live `.github` checkout) and proves the generator/
`on:` plumbing already tolerates it; this is the first _current_
instance.

## Open risks

- **Unverified: does a `deployment_status`-triggered workflow run
  actually post as a GitHub check on the PR's commit?** GitHub Actions
  attaches workflow-run status to whatever SHA the triggering event
  resolves to, and `deployment_status` carries `deployment.sha` — this
  should work the same way `push`/`pull_request`-triggered runs do,
  but needs live confirmation on the first real preview deploy.
- **Vercel must actually set `environment_url` on the `deployment_status`
  event** — confirmed as Vercel's documented behavior for its GitHub
  integration, but not yet confirmed against this org's own Vercel
  project. `target_url` is the fallback if not.
