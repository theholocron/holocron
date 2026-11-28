---
status: draft
issue: theholocron/holocron#2659
blocked-by: []
related:
  - theholocron/holocron#2203
  - theholocron/holocron#2608
  - theholocron/holocron#2657
---

# A separate preview Sentinel instance

## Problem

Sentinel is the GitHub App that posts a pull request's checks, including `validate:config`, which validates a repository's
`holocron.config.ts` against the astromech registry bundled into the deployed Sentinel. This repository's default branch is
`alpha`, so its pull requests are judged by whatever Sentinel is running, and that is production:

- A registry change on `alpha` (a new task id) fails the config check on every pull request that lists it until Sentinel is
  redeployed, and a change in a package Sentinel bundles (`cli/cli`, `cli/astromech`, `cli/kyber`, `cli/datapad`) triggers no
  deploy at all.
- The only automatic deploy of `alpha` code is Sentinel's own `deploy` task (`apps/sentinel/holocron.config.ts`,
  `with: { on: "release", channel: "alpha" }`), which runs `pnpm run deploy`, and that script deploys with
  `--target production` to the project `sentinel`. So `alpha` code reaches the production servers on release. That is the
  thing to stop, not to extend.
- `--env preview` of `deploy <app>` and `sync <app>` (#2608) reads the `prod` vault layer (`parseAppEnv()`), so a preview
  deploy would carry production secrets.
- A deploy that starts while a release is publishing reads some `alpha` tags before the release and some after, and Vercel's
  install fails (#2657, fixed by #2658; it applies to this deploy too).

## Decided

Decided with the maintainer on 2026-11-27 and 2026-11-28.

- **Nothing is shared with production.** The preview instance has its own Vercel project (`sentinel-preview`), its own GitHub
  App (`sentinel-preview`) and its own secrets. Production keeps its project, App and deploy and is never given `alpha` code
  by automation.
- **A `preview` layer.** `ENVIRONMENT_LAYERS` (`local`, `dev`, `ci`, `prod`) gains `preview`, whose Environment is
  `<org/repo> - preview` (`layerEnvironment()`, the one place that name is built). There is **no fallback to `prod`** and no
  `inherit` list: a value the instance needs is in the `preview` Environment, or the deploy stops with a missing-secret
  failure before anything is sent. `local` over `dev` is a different thing (a developer's own machine) and is not copied.
  `parseAppEnv()` returns the `preview` layer for `--env preview`, so `sync sentinel --env preview` reads the preview
  Environment and the deploy filter (`repo.secrets.deploy`) has its own entry for `layer: "preview"`.
- **The name `preview` means this instance.** In prose it is "the preview instance". It is not the per-pull-request Vercel
  preview deployment that the `deploy-preview` and `check-preview` tasks make; those tasks are not changed here.
- **Routing is by installation, not by code.** An App only receives deliveries for the repositories it is installed on. The
  preview App is installed on the repositories whose default branch is `alpha` (this one), and the production App on the
  others; a repository has exactly one of the two, so no pull request is judged twice and Sentinel needs no branch routing.
  This is the epic's "reads the preview instance for pull requests to `alpha`". Moving this repository's own traffic to the
  preview App is a human step done after the instance is verified (below), and until then both are not installed together.
- **Deploy on `workflow_run`.** A caller (`ci.deploy-sentinel-preview.yml`) runs after the release workflow finishes
  successfully on `alpha`, so the release has published every package before the deploy reads the tags (#2657 makes the
  lookup retry as well). It is a separate caller and job with its own concurrency group, and it deploys only when the
  release changed Sentinel or a package it bundles (the paths `deploy on-release` already uses).
- **Production deploys itself from `main`, and only from `main`.** Sentinel's release-time `deploy` task
  (`on: release`) today names `channel: alpha`, and runs `pnpm run deploy`, which deploys with `--target production`: alpha
  code reaches production on release. It changes to the default channel (`main`), so a stable release that changes Sentinel or
  a package it bundles deploys production, through the machinery `deploy on-release` already has: it waits for npm to serve
  the release's packages, diffs from the commit last deployed (`deployed/theholocron-sentinel`, so a missed deploy is made
  up by the next release) and records the tag only after a success. The path trigger on a push to `main` that touches
  `apps/sentinel/**` (`ci.deploy-sentinel.yml`) is dropped: it deploys before the release has published the bundled packages,
  and the release job covers it. `workflow_dispatch` stays, as the way to re-run a deploy by hand. Both run under the
  `sentinel-deploy` concurrency group, so two never overlap. Because `alpha` reaches `main` only when a stable release is cut,
  production runs stable code and the preview instance runs `alpha`.
- **A production deploy waits for an approval.** The production deploy job (the `deploy` job of the release workflow that
  `deploy on-release` runs in, and the manual `deploy-sentinel` job) declares a GitHub Environment, `sentinel-production`,
  with required reviewers, so the job stops at "waiting" until a reviewer approves it. A rejected or unanswered deploy
  fails the job with no deploy and no `deployed/` tag, so the next stable release makes it up. The Vercel token the deploy
  uses is stored as a secret of that Environment, so no other job can read it. The preview instance has no gate. Not
  verified: that required reviewers are available on this repository's plan (they are free on a public repository and need a
  paid plan on a private one), and whether the `environments` capability's GitHub implementation can set reviewers; if it
  cannot, `setup` reports the reviewers as a `todo` and the maintainer sets them in the repository settings.
- **Crons stay with production.** `/api/scheduled` and its `CRON_SECRET` belong to the production project (the dispatch
  of `sync-incidents` and the others, #2609). The preview Environment leaves `CRON_SECRET` and `SENTINEL_SCHEDULE_REPO`
  out, so its `/api/scheduled` answers 503 and a call that reaches it does nothing. The staged preview payload leaves
  `crons` out of `vercel.json` so Vercel does not call it at all.
- **`setup` makes what an API allows.** The Vercel project, its domain and the DNS record come from `setup` and the plugins
  that already do this for production; the App, its installation and its permissions are what no API completes, so they are
  `todo` rows that fail the run until done, as every other `setup` step reports.

## The instance declaration

Today the project name is the app folder's name (`--project-id sentinel`) and the domain is the app's one `deployment.domain`.
An app that has a preview instance declares it beside the production one:

```ts
deployment: ["vercel", { domain: sentinelHost, instances: { preview: { project: "sentinel-preview", domain: `sentinel-preview.${domain}` } } }],
repo: { secrets: { deploy: [{ layer: "prod", ... }, { layer: "preview", ... }] } },
githubApps: [ /* production */, { name: "sentinel-preview", manifest: "github-app.preview.manifest.json", layer: "preview" } ],
```

`deploy <app> --env preview` and `sync <app> --env preview` then address that instance: the project and domain it names (a
project is made if `setup` has not), the `preview` layer's secrets and a deployment made as that project's production
target, because the project holds nothing else. An app with no `instances.preview` keeps today's meaning of `--env preview`
(a Vercel preview deployment of its one project) until it declares one. The exact keys are settled in the implementation
pull request; this section fixes what they must express.

The GitHub App has its own manifest file (a different name and webhook URL, `https://sentinel-preview.<domain>/api/webhook`)
and is made with `holocron new github-app`, which writes its id, key and webhook secret to the private import file for the
`preview` Environment. `doctor github-app` compares it like the others.

## Not decided, left for later

- Whether the per-pull-request `deploy-preview` task should deploy into the preview project too. It uses the production
  project's Vercel preview target today, which holds production's variables; moving it is a separate change.
- A second Discord bot or Checkly checks for the preview instance. Its Environment can hold copies of the same values, by
  hand; monitoring a second hostname is not part of this.
- Who the reviewers are beyond the maintainer, and whether the preview instance's token moves into an Environment too.

## Verification

Unit tests over injected IO: `parseAppEnv()` returns the layer for each environment, `layerEnvironment()` names the
Environment, the deploy filter and the missing-secret failure run before anything is sent, `deploy`/`sync` pick the project
and domain of an instance, the staged preview payload has no `crons`, and `probe generated check` is clean for the new
caller. `doctor secrets` shows the `preview` column. **Not verified, and the maintainer's to run:** the Vercel project and
domain creation, that a project's own production deployment serves the domain, the App's permissions and installation, that
`workflow_run` fires after the release workflow, and the move of this repository's installation to the preview App.

## Rollout, in small pull requests

1. This spec.
2. The `preview` layer: `ENVIRONMENT_LAYERS`, `parseAppEnv()`, `sync`, `doctor secrets` and the token tables (`tokens.mdx` per
   layer, `PluginToken.expect`), docs and tests.
3. `instances.preview` in the config schema; `deploy <app>` and `sync <app>` use it; the staged payload without `crons`.
4. `setup` makes the project and domain; the manifest and `githubApps` entry; `doctor github-app` reads it.
5. The `workflow_run` deploy caller for the preview instance; Sentinel's `deploy` task moved to the `main` channel; the push
   trigger dropped from production's caller; the `sentinel-production` Environment on both production deploy jobs.
6. Human steps, in order: the `preview` Environment in 1Password, `new github-app` and its installation, `setup`, `sync
sentinel --env preview`, the first deploy, a pull request's checks read from the preview App, then moving this repository's
   installation from the production App to it.
