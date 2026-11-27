---
id: SPEC-0111
status: accepted
issue: theholocron/holocron#2609
blocked-by: []
related:
  - theholocron/holocron#2302
  - theholocron/holocron#2366
  - theholocron/holocron#2359
discussion:
  url: https://discord.com/channels/1303969001822486568/1575029181165604975
---

# Start scheduled workflows from Sentinel

## Problem

GitHub starts a `schedule` workflow late or not at all when it is busy ("can be delayed during periods of high loads",
"some queued jobs may be dropped", GitHub's _Events that trigger workflows_). On 2026-11-24 the ten minute `sync-incidents`
cron started 2 times of 144, the hourly `sync-specs` and `reconcile-projects` 3 times of 24, and `check-tokens` started 11
hours late. The runs that did start were green. The Checkly heartbeats for these workflows alerted and recovered every 6 to 9
hours (#2609), and `sync incidents` mirrored an incident to Discord hours late.

Nothing about the cron expressions or the workflows is wrong, and the Checkly plan is not involved. The trigger is
unreliable, so the trigger has to move.

## Decided

- **Sentinel starts the workflow.** Sentinel is the GitHub App: it already holds the App's id and key, mints installation
  tokens and writes to GitHub on a person's behalf, and the sync is GitHub work. A Vercel cron entry in
  `apps/sentinel/vercel.json` calls a second function, `api/scheduled.mjs`, which asks GitHub to run the workflow with
  `workflow_dispatch` (`createWorkflowDispatch()`, already in `@theholocron/github-client`). Comlink is the alert relay and
  stays out of it. The project is on Vercel Pro, so a ten minute schedule is allowed (the plan limits are Vercel's, read
  from its docs, not verified here: the first change ships one cron and the maintainer checks it fires).
- **The sync itself does not move.** The workflow, the `sync incidents` command, its tokens and its heartbeat ping stay as
  they are, so the heartbeat still proves the work ran and not only that Sentinel asked. Sentinel holds no Checkly or Discord
  token.
- **The GitHub cron stays as a fallback.** A dispatch and a late schedule can both fire; the workflow's `concurrency` group
  has `cancel-in-progress: false`, so a running job is never cancelled. GitHub keeps at most one _pending_ run per group
  and a newer pending run replaces an older one, so while a sync is running, several dispatches collapse into one that
  waits. That loses nothing here: `sync incidents` reads the page's current state and posts what is missing, so the run
  that follows covers every one that was replaced, and a run lasts seconds against a ten minute period. A task added later
  must be as idempotent, or must not be dispatched on a period shorter than its run. Nothing is removed from a workflow.
- **Names only.** The code holds a table from a task id to a workflow file (`sync-incidents` to `ci.sync-incidents.yml`);
  the repository comes from `SENTINEL_REPO` (`owner/repo`; it was `SENTINEL_SCHEDULE_REPO` before the repository variables were merged). With it unset the function answers `404` and does
  nothing, so a deployment that does not want it is untouched.
- **Fail closed.** Vercel sends `Authorization: Bearer <CRON_SECRET>` when the project has a `CRON_SECRET` variable. The
  function compares it in constant time and answers `401` for anything else, and `503` when `CRON_SECRET` is not set, so a
  public URL can never start a workflow. The secret lives in Sentinel's `prod` 1Password Environment and goes out with
  `repo.secrets.deploy`, like the App's key. `CRON_SECRET` is the name Vercel reads, so it has no `SENTINEL_` prefix and the
  entry's `prefix` does not cover it: it is listed in that entry's `keys` (`apps/sentinel/holocron.config.ts`), or a sync
  would leave it out of Vercel and the function would answer `503`.

## Design

- `apps/sentinel/api/scheduled.mjs`, a thin adapter beside `webhook.mjs`, calls `handleScheduledRequest(request, env)` from
  the built `dist`. It reads `?task=<id>` (the cron entry carries it), checks the secret, finds the repository's
  installation with the App's JWT (`GET /repos/{repo}/installation`), mints an installation client
  (`createInstallationClient()`), reads the repository's default branch and calls
  `createWorkflowDispatch(repo, file, defaultBranch)`.
- `apps/sentinel/src/actions/scheduled-dispatch/`: `SCHEDULED_TASKS` (the table), `runScheduledDispatch()` (pure
  decisions over an injected client), and a log line `scheduledDispatch` (task, repo, workflow, status) beside the
  `githubDelivery` ones; a failure is sent to the error tracker and answered `502`, never retried within the request.
- The App needs **Actions: read and write** (`default_permissions.actions` in `github-app.manifest.json`, set by hand on
  each existing App like the `status` event was, so `doctor github-app` reports the drift until then).
- `vercel.json` gains `crons: [{ path: "/api/scheduled?task=sync-incidents", schedule: "*/10 * * * *" }]`. Other tasks
  (`sync-specs`, `reconcile-projects`, `reconcile-ci`, `check-tokens`) are one table row and one cron entry each, later,
  with two checks each time. The row names the repository's thin caller (`ci.<id>.yml`), not the reusable (which only has
  `workflow_call`), so the task must be listed in `tasks:` and its caller must declare `workflow_dispatch` (the generated
  ones do, `reconcile-ci` included). And the dispatch ref is the repository's default branch, which is `alpha` here; a job
  with a branch guard, like `sync-specs`' `github.ref == 'refs/heads/alpha'`, passes on it, and a repository whose default
  branch differs needs the task checked first.
- A dispatched run is titled `(manual)` by the thin caller's `run-name`, because its event is `workflow_dispatch`. It is
  accepted for now; the run list says which of the two started it only through its event.

## Not decided, left for later

- Whether the schedule should be declared in `holocron.config.ts` (a `tasks` entry's `schedule`) so `holocron sync` writes the
  `vercel.json` entry. Today it is two hand-kept lines.
- Whether to retire the GitHub cron once the dispatch has run reliably for a month.

## Verification

Not verified against the live services, and the maintainer does these steps: that Vercel starts the cron every ten minutes on
this plan; that the installation token with `actions: write` can dispatch (a dispatch answers `204` with no run id); that a
dispatch queued behind a running job waits and does not cancel it. The first change should be tried with one manual call
(`curl -H "Authorization: Bearer $CRON_SECRET" .../api/scheduled?task=sync-incidents`) before the cron is relied on, and the
run count watched for a day against the 144 expected.

## Rollout, in small stacked pull requests

1. This spec.
2. `@theholocron/github-client`: `getRepoInstallation()`, which finds the App's installation on a repository with the App's
   JWT (a scheduled call has no webhook to read the id from).
3. Sentinel: `scheduled-dispatch` action, `api/scheduled.mjs`, the `vercel.json` cron, the manifest permission, `holocron
deploy stage` shipping every `api/*.mjs`, tests and the docs (`docs/src/content/docs/` Sentinel page, `AGENTS.md`).
4. Human steps: add `Actions: read and write` to each App, then **approve the permission update on each installation**
   (changing an App's permissions does not give them to an installation that has not accepted the request, and without it
   the installation token cannot dispatch); run `holocron doctor github-app` and wait for its installation rows to pass
   before relying on a dispatch. Set `CRON_SECRET` and `SENTINEL_REPO` in the `prod` Environment,
   `holocron sync secrets --env prod --cwd apps/sentinel`, deploy, watch the run count.
