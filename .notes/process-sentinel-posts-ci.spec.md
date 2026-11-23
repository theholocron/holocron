---
id: SPEC-0099
status: proposed
issue: theholocron/holocron#2426
blocked-by: []
related:
  - theholocron/holocron#1262
  - theholocron/holocron#1613
  - theholocron/holocron#2171
  - theholocron/holocron#2263
  - theholocron/holocron#2036
  - theholocron/holocron#1478
  - theholocron/holocron#1738
  - theholocron/holocron#2388
  - theholocron/holocron#1100
  - theholocron/holocron#2203
  - theholocron/holocron#2359
discussion:
  url: https://discord.com/channels/1303969001822486568/1573009245530493092
---

# Sentinel posts the `ci` aggregate check itself

## Problem

The one required check, `ci / Required checks`, is a GitHub Actions reusable workflow (`ci/workflows/ci.yml`). It polls the
Checks API every 30 seconds for the head commit until every expected check has completed, or 30 minutes pass. That costs a
runner for the whole wait (up to the 45 minute job limit), and it has a limitation that SPEC-0064 accepted: re-running one
leaf does not update `ci`, which stays red until `ci` is re-run too.

SPEC-0064 (`ci-flat-task-vocabulary`, #1262), in its decided Q3, records that the maintainer wants Sentinel to post `ci`
itself, as a direction only, and says it needs its own spec. Its text says "the `ci` context name and the `expected` /
`statuses` lists are the contract, so swapping the implementation changes no ruleset". This spec tests that claim against
the code (see "Who may post the check").

This spec is the design. It builds nothing and changes no workflow, ruleset or config.

## Decisions at a glance

The maintainer's framing: "post that check from Sentinel" is the small half. The aggregate is a function of other checks, so
it needs `check_run` and `status` events, the expected list from the repo's config, and a cutover with no missing check.
Decided: if Sentinel is down or misses a delivery there must be a way to recompute. Recommendations (each argued below):

| Question                    | Recommendation                                                                                                                                                             |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| What is computed, from what | One pure function over state read from the API, never the payload. Events only say "recompute this SHA".                                                                   |
| Shared logic                | One TypeScript function in `@theholocron/astromech`, used by Sentinel, a CLI command and the sweep. The Actions fallback is held to it by shared fixtures.                 |
| Recovery, in order of cost  | (1) `check_run.rerequested` on the aggregate, (2) failed-delivery redelivery, (3) a scheduled sweep, (4) the Actions poller as a reversible fallback, (5) a health signal. |
| Who may post                | Sentinel's production App only, enforced by pinning the ruleset's required check to its `integration_id`, as a later phase.                                                |
| Where `expected` comes from | The config at the **base** ref, through `aggregateChecks()`, so a pull request cannot weaken its own gate.                                                                 |
| Cutover                     | A per-commit switch carried in the repo's own config, so each SHA has exactly one poster. Shadow first under another name. This repo first, on the dev instance.           |

## What exists today (read from the repo)

- **The aggregate** (`ci/workflows/ci.yml`): `expected` is a list of task ids; each needs a check run whose name starts with
  `<id> /`, all completed. `statuses` is a list of contexts (`codecov/patch`, ...), each accepted as a check run named like
  the context, else as a commit status. `success`, `skipped` and `neutral` pass. An id with no run at the timeout fails as
  "never posted". Only the newest run of each check name counts (latest `started_at`, then `id`, #2171). The job never waits
  for itself (it drops `ci` from `expected`). The logic is a `jq` program inside the workflow: it cannot be tested in vitest
  or reused.
- **Where the lists come from**: `aggregateChecks(config, statusContexts?)` in astromech derives `expected` and `statuses`
  from the `required: true` tasks and `extraRequiredChecks`. A context is a status when the coverage provider names it
  (`Coverage.statusContexts()`), else when it starts with `codecov/` (the default kept when no provider is loaded, which is
  the case for `sync`, `setup` and Sentinel's remote checks). `aggregateCaller()` writes them into the thin caller
  `.github/workflows/ci.ci.yml` as `with:`, **only in the repo that contains the reusables, so this repo is the only repo
  with an aggregate today**. Other repos are on the legacy gate with per-task required checks.
- **Sentinel already runs five of the expected checks** (`lint:commits`, `lint:editorconfig`, `lint:markdown`,
  `validate:specs`, `validate:docs`, #2263; `sentinel: true` tasks have no caller but stay in `expected`). The aggregate
  already cannot pass while Sentinel is down.
- **Sentinel's subscriptions** (`apps/sentinel/github-app.manifest.json`): events `check_run`, `issues`, `membership`,
  `organization`, `pull_request`, `pull_request_review`, `push`. Permissions include `checks: write`; there is **no `status`
  subscription and no `statuses` permission**. `createCheckRun()`, `updateCheckRun()` and `listCheckRunsForRef()` exist in
  `@theholocron/github-client` (`clients/github-client/src/checks/checks.ts`); `listCheckRunsForRef` reads at most 1,000 runs.
- **Sentinel already reads the aggregate.** `parseWebhookEvent()` drops every `check_run` except a completed one named
  `ci / Required checks` (`SENTINEL_PR_FEED_CHECK_NAME`), which feeds the `#prs` feed (#1738) and board status (#2388); both
  read the pull request from the API, not the payload. That is evidence in the code that Sentinel receives check runs the
  Actions app created; it is not proof from GitHub's documentation.
- **Sentinel production is up** (AGENTS.md and `tech-board-status-automation` say #1100 was resolved; SPEC-0064's "Sentinel
  is down" is out of date). The dev instance (#2203) is where a new handler is tried first. Not re-verified here.
- **Rulesets name a context only.** `cli/cli/src/commands/setup/branch-protection.ts` writes
  `required_status_checks: requiredChecks.map((context) => ({ context }))`; `integration_id` appears in no source file of
  `cli/` or `plugins/` (only the string occurs in tests of `read-repo`, `source` and `repo-checks`, so the read side
  tolerates it; whether it compares it is to be checked). `doctor repo` compares contexts only (`compareRequiredContexts`).
  Today any app may satisfy `ci / Required checks`.
- **Liveness**: Sentinel has no health endpoint. Two Checkly checks watch the webhook (a GET answers 405, an unsigned POST
  401); they prove the route answers, not that Sentinel can read or write checks.
- **The reconcile precedent** (`reconcile-projects`): a registry task, a reusable `ci/workflows/reconcile-projects.yml`, an
  hourly thin caller, a Sentinel GitHub App installation token (`SENTINEL_GITHUB_APP_ID` / `_PRIVATE_KEY`), a heartbeat, and
  an entry in `platform.notifications.yml` for the `#alerts` post. The sweep below copies it.

## Goals

- `ci / Required checks` is posted by Sentinel from webhooks: no idle runner, no polling, and a re-run of one leaf updates it.
- Same contract as today: same context name, same `expected` / `statuses` meaning, same newest-run-wins rule, same pass set,
  same failing-first summary with links.
- No window, at any step of the migration, in which the required check is missing or can be satisfied by something that
  should not satisfy it.
- When Sentinel is down or misses a delivery, the aggregate can be recomputed by a written-down path that does not depend on
  Sentinel's webhook route, and a person is told.
- A bug cannot turn a red pull request green without a test failing first.

## Non-goals

- Moving any other task between Sentinel and Actions (`process-sentinel-and-actions-roles`, #2263).
- Other repos' rulesets or callers. They have no aggregate yet and follow `CI_HOME`.
- Changing `DCO`, which stays its own required context.
- Sentinel's hosting and deploy cadence (#945, #2203).
- Merge queues. This repo uses none (the ruleset has no merge queue rule and no workflow triggers on `merge_group`), and a
  `check_run` on a merge group commit carries no pull request, which this design does not handle. A queue needs its own spec.

## What is computed, and from which events

### The function

On a trigger for a head SHA, read the state from the API (never the payload; the rule the `#prs` feed and board status follow)
and call one pure function:

```text
evaluateAggregate({ expected, statuses, checkRuns, commitStatuses, now, startedAt, timeoutMs })
  -> { conclusion: "pending" | "success" | "failure", rows: Row[], summary: string, annotations: Annotation[] }
```

1. Keep the newest run per check name (latest `started_at`, then `id`: the #2171 rule, byte for byte the sort key of the jq).
2. For each `expected` id, runs named `<id> / ...` classify as success, failure, pending or missing; for each `statuses`
   context, a check run named like it wins, else a commit status.
3. `pending` while anything is pending or missing and `now - startedAt < timeoutMs`. After the deadline, pending and missing
   become failures ("timed out while still running", "never posted"), as today.
4. `success` only if every row is a success. An empty `expected` is **not** a success: it is a failure naming a config error.
5. `summary` and `annotations` are the same failing-first table and the same one-line error per failing id.

The function takes `now` and `startedAt` as arguments, so the 30 minute timeout is testable and the sweep, which can run long
after the events, gets the same answer as a webhook would have.

`startedAt` is the `started_at` of the aggregate's own first run for that SHA (set when Sentinel first posts `in_progress` on
`pull_request` opened or synchronize), so the deadline is "30 minutes after the aggregate began waiting", which is what the
polling job measures.

### Events and ordering

| Event                                                          | What Sentinel does                                                                                                            |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `pull_request` opened, synchronize, reopened, ready_for_review | Post `ci` as `in_progress` at once (so the required check exists), then recompute                                             |
| `check_run` completed                                          | Only for a name matching an `expected` prefix or a `statuses` context (decided from the payload, before any fetch): recompute |
| `check_run` rerequested, on the aggregate                      | Recompute that SHA (see Recovery 1)                                                                                           |
| `status`                                                       | Only for a context in `statuses`: recompute. Needs the `status` subscription and `statuses: read` (an owner accepts it)       |
| `check_run` created                                            | Not used: a new run is pending, which is already the in-progress default                                                      |

Recommendation: **subscribe to `status`**. It is one new event, filtered by a list before any fetch, and without it a
`codecov/*` commit status that is not also a check run would be seen only by the next event or the sweep. Whether Codecov
posts check runs, statuses or both for this repo today is not verified; the polling job accepts either, so the function must.

Ordering and redelivery are handled by one rule: **the payload's conclusion is never used**. Every trigger recomputes from
the API, so deliveries in any order, duplicates and redeliveries produce the same table. Two things remain, and are decided:

- **Parallel invocations.** Two deliveries for one SHA can run at once on a serverless host (no lock). Post by finding the
  existing run (`listCheckRunsForRef`, name `ci / Required checks`, created by this App) and `updateCheckRun()` it; create
  only when none exists. After a create, list again, keep the **oldest** as canonical and complete any extra as `neutral`
  with a note (the `convergeCreatedIssue()` pattern the ideas sync already uses).
- **A slow older computation overwriting a newer one.** After every write, read the state once more and recompute; if the
  verdict differs from what was written, write again (once). The sweep repairs anything left. This costs one extra read per
  event and removes the window where a stale `in_progress` lands after a `success`.
- A completed run can become `in_progress` again when a leaf is re-run; whether GitHub accepts `status: in_progress` on a
  completed check run, or needs a new run, is not verified (see "Not verified"). The design falls back to creating a new
  run and treating the newest as canonical, the same #2171 rule.

### Where `expected` comes from

Options: A, the config at a ref through `aggregateChecks()`; B, the committed thin caller's `with:`; C, a new generated names
file. **Recommendation: A, read at the pull request's base ref.**

- It is the same function that writes the caller, so it cannot drift, and Sentinel already reads the config at a ref for the
  config check. No generated workflow becomes a runtime input (B) and no new generated file is added (C).
- **Base, not head.** A pull request that edits `holocron.config.ts` could otherwise remove a required task from its own
  gate. Reading the base ref means a task added or dropped by a pull request takes effect once it merges. The cost: a pull
  request that adds a required check is not blocked by it until merge, which is how a ruleset edit behaves today.
- Plugins: `statuses` depends on the coverage provider's `statusContexts()`, which needs the plugin loaded. Sentinel's remote
  config read may not load plugins (not verified). Without them `aggregateChecks()` falls back to the `codecov/`
  prefix, the behaviour the repo keeps on purpose. Acceptable for now (this repo's three statuses all start with `codecov/`);
  a repo that renames them needs the provider loaded, which is the later spec for other repos.

## How it differs from polling

| Concern                      | Polling (today)                                           | Sentinel from webhooks                                                                                                           |
| ---------------------------- | --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Latency after the last check | Up to 30 s (poll interval)                                | Seconds: one delivery plus one or two API reads                                                                                  |
| Cost                         | A runner for the whole wait                               | One short invocation per relevant event; `check_run` events that match no expected name are dropped before any fetch             |
| Re-run of one leaf           | Does not update `ci` (accepted limitation)                | Updates it: the re-run's `check_run` events trigger a recompute                                                                  |
| Event ordering, redelivery   | Not a concern: it reads the whole state each poll         | Not a concern for the same reason, given "recompute from the API every time" and verify-after-write                              |
| A missed or lost delivery    | Cannot miss: it polls                                     | **Real gap.** A lost final `check_run.completed` leaves `ci` `in_progress`. Covered by Recovery 2 and 3                          |
| The 30 minute timeout        | Local clock in the job                                    | **Real gap.** No event fires when nothing happens. Covered by the sweep, which passes `now` to the same function                 |
| Concurrent invocations       | One job                                                   | Duplicate runs possible; converge as above                                                                                       |
| Explaining a failure         | The job summary and a `::error` annotation per failing id | A check run `output` (title, summary, annotations): the same information. Annotations beyond the 50 cap need a follow-up `PATCH` |
| Codecov statuses             | Polls the commit-status API                               | `status` subscription, or Codecov's check run alone                                                                              |

The "newest run of each check name wins" rule (#2171) does not change: it is step 1 of the function. Its conformance is the
first test (see "Safety").

## Recovery: when Sentinel is down or misses a delivery

Decided requirement: there is always a way to recompute. The mechanisms are layered, cheapest and most local first; each is
independent of the one before it.

### 1. `check_run.rerequested` on the aggregate (the Re-run button)

GitHub shows a Re-run button on a check run; pressing it sends `check_run` with action `rerequested` to the app that owns the
run. Sentinel handles it by recomputing that SHA. Effects:

- It is the **manual recovery that needs no tool**: a person on the pull request presses Re-run on `ci / Required checks`.
- It fixes the known SPEC-0064 limitation in the one place a person looks: re-run a leaf, then press Re-run on `ci` (or, better,
  the leaf's own completion event already recomputed it, so the button is rarely needed).
- It works only while Sentinel is up. When Sentinel is down, the button does nothing, which is why 2 to 4 exist.
- Verification needed: that GitHub sends `rerequested` to the owning app only, and that a check run created via the API with no
  `actions` still shows Re-run (to verify on the dev instance in phase 3).

### 2. Failed-delivery listing and redelivery

An App's webhook deliveries can be listed and redelivered (GitHub's App webhook deliveries API, authenticated with the App's
JWT). A command `holocron redeliver webhooks [--since <time>] [--dry-run]` (CLI, `workspace`) lists the App's deliveries,
keeps those whose status is not a success, and redelivers each once, oldest first. It is the recovery step after a Sentinel
outage, and it repairs **every** Sentinel handler (the `#prs` feed, board status, role sync, the five checks), not only the
aggregate. The aggregate is safe to replay because of "recompute from the API". Limits: GitHub's delivery log has a retention
window (to verify) and lists failures, not deliveries that were never attempted; a `doctor` row can count failed deliveries
in the last day. This is a repair tool, not the primary safety net (3 is).

### 3. A scheduled sweep (the safety net)

A registry task `reconcile-ci`, in the shape of `reconcile-projects`: a reusable `ci/workflows/reconcile-ci.yml`, a thin caller
on a schedule, a heartbeat, an entry in `platform.notifications.yml`. It runs the new CLI command, which is also the manual
tool:

```text
holocron reconcile ci [pull-request]  [--dry-run] [--max-age <minutes>]
```

- With no argument it lists open pull requests, and for each reads the head SHA's `ci / Required checks` and recomputes with
  `evaluateAggregate()` (the same function Sentinel imports from astromech). It posts only when the stored result is
  **missing, `in_progress` past `--max-age`, or differs from the recomputed verdict**. A pull request whose stored result
  already matches is left alone, so a healthy run does nothing and costs one list plus one read per open pull request.
- With a pull request number it does the same for that one (the manual path when someone is stuck, runnable from a laptop).
- It posts as the **Sentinel GitHub App** (installation token minted from `SENTINEL_GITHUB_APP_ID` and
  `SENTINEL_GITHUB_APP_PRIVATE_KEY`, as `reconcile-projects` does), not as `GITHUB_TOKEN`: a check run posted with
  `GITHUB_TOKEN` belongs to the `github-actions` app, which matters as soon as the ruleset is pinned to Sentinel's app.
  **Decided:** the installation token is minted narrowed, with only `checks: write`, `pull_requests: read` and `statuses: read`
  (GitHub accepts a `permissions` subset when it creates an installation token), so the same key reaches no more than the sweep
  needs and still posts as Sentinel's App.
- **Cadence: every 15 minutes** (`*/15 * * * *`). GitHub delays and drops scheduled runs (the heartbeat section of
  `tech-monitoring-dashboards-status-pages` already says so), so the heartbeat is more lenient than the cron: period 1 hour, grace 2
  hours, tagged `scheduled`, like `reconcile-projects`. 15 minutes bounds how long a stuck pull request waits to well under the
  30 minute deadline when the schedule runs; it is a bound for the normal case, not a guarantee.
- It also applies the **timeout**: it passes `now`, so a run still pending past 30 minutes becomes the "never posted" failure
  even when no event ever arrived.

The CLI command is the third place that runs the function, so it must not depend on Sentinel's runtime: it imports
astromech's function and the GitHub client, nothing from `apps/sentinel`.

### 4. The Actions poller, kept as a reversible fallback for a stated period

The reusable `ci/workflows/ci.yml` and the caller generation stay in the repo through the cutover and for **two weeks and at
least 20 merged pull requests after it**, with the sweep reporting no repair beyond a 10 minute grace in that time. During it,
"switched on" means the repo's config says `aggregate: "actions"`, and falling back is a revert of the cutover pull request.
It is switched off by deleting the reusable, the caller generator and the jq (phase 11), after which the only recovery for a
Sentinel outage is 1 to 3 and a ruleset bypass. The jq stays in step with the TypeScript until then through shared fixtures
(see "Safety"); it is not rewritten to call the CLI, because its value is that it needs nothing built.

### 5. A health signal to #alerts

Three signals, none new infrastructure:

- **The sweep fails its own run when it had to repair a pull request that was stale longer than a 10 minute grace** (the list
  goes in the job summary). A repair means Sentinel missed or failed something, which is exactly the signal. A failed run
  reaches `#alerts` through `platform.notifications.yml` once `reconcile-ci` is in its workflow list (the post names the failing
  job, #1614). The grace stops it paging on a delivery still in flight.
- **The heartbeat** (`HOLOCRON_HEARTBEAT_RECONCILE_CI`, the #2359 pattern, last step so only a green run pings) tells a person the
  sweep itself stopped running.
- **A failed-delivery count** in a `doctor` row (Recovery 2), included in the daily `doctor` posts, for the case where deliveries
  fail but nothing is stale yet.

Not recommended: a heartbeat pinged by Sentinel on each completed `ci`. A quiet repo for a day would page, which is wrong; the
sweep's heartbeat measures the same thing without false alarms.

A merge while Sentinel is down is a ruleset bypass by a person with that role. Whether a bypass role exists on every repo is
open (#1478); this spec's runbook is "press Re-run on the aggregate, else `holocron reconcile ci <pr>`, else bypass", in that
order, and the runbook says which one the maintainer chose.

## Who may post a check named `ci / Required checks`

Any GitHub App with `checks: write` can post a check run with any name, and, because rulesets here name a context only, **any
app, or a workflow in a pull request, can satisfy `ci / Required checks` today**. A pull request can even edit `ci.yml`. This is
a trust-the-org assumption, not a control; SPEC-0064's "no ruleset change" is true for the context name and false if the
identity should be pinned.

Recommendation: **pin it, as its own later phase**. GitHub lets a required status check name the source app (an `integration_id`
on the entry). The change needs:

- `setup/branch-protection.ts` writes `{ context, integration_id? }` from a config value (names the pinned context to an app;
  the app id comes from the `githubApps` entry for the prod instance, so no number is typed twice).
- `read-repo` and `compareRequiredContexts` read and compare the source; `doctor repo` adds a row for a context whose source is
  not the declared one, and for the dev instance (a different app id) a repo may declare both ids or only prod. Recommended:
  only prod, so the dev instance's posts never satisfy a merge.
- `repo.protection` (the preset) learns the option; `holocron setup` writes it, `holocron apply` stays out of it.

Pinning changes the failure mode of an outage from "a stale check" to "nobody can satisfy the check except a bypass or the
sweep" (which posts as the same App, so it counts). It is therefore **after** the sweep is live and after the bypass question
(#1478) is answered. **Decided:** pin after #1478 is answered. The ruleset `holocron-default-branch` already has one bypass actor,
`RepositoryRole` id 4 (taken to be Write), mode `always`, and the outage runbook relies on it. It also removes the forge-by-workflow route: with the pin, a pull request that edits `ci.yml` cannot post the
required result.

The sweep's App key sits in the Actions secrets of `reconcile-projects` already; giving the same key to a second workflow widens
who can post the check to anyone who can change that workflow on a branch. Mitigation: the sweep's secrets are used only by the
scheduled and manually dispatched caller, never a `pull_request` run, and the reusable is read from the base branch, and the token
it mints is narrowed to the three permissions it needs. Listed as a risk below.

## Cutover with no missing-check window

Invariant: on every commit of every open pull request there is exactly one poster of `ci / Required checks`.

**Why not two posters of one name.** If the Actions job and Sentinel both post the real name on one SHA, GitHub's evaluation of a
required context with two runs from two apps is not verified (any green, the newest, the worst). The plan never depends on it.
**Why not a second name.** A temporary context needs a ruleset change in each direction, with a window in each step.

**The switch lives in the repo's own config, per commit.** A new setting (named in phase 5, for example
`ci: { aggregate: "actions" | "sentinel" }`, default `actions`) says who posts. It drives three things from one place:

- `aggregateCaller()` writes the caller `ci.ci.yml` only when the value is `actions`; the reusable is generated only then.
- Sentinel posts the real name only when the **head** ref's config says `sentinel`.
- `doctor ci`'s `aggregate` row and `probe generated check` follow it (below).

So each commit carries the files that run for it and the setting that tells Sentinel to act: a head with `actions` has the old
caller and Sentinel stays silent on the real name; a head with `sentinel` has no caller and Sentinel posts. Open pull requests
that predate the flip keep the Actions result until their next rebase, which is the existing behaviour for any change to
`.github/workflows`. There is no commit with zero or two posters, provided a flip pull request's generated files match its
setting (which `probe generated check` enforces).

(The setting is read at the **head** ref because it must match the workflow files that run for that commit; `expected` is read at
the **base**, so a pull request cannot shrink its gate. A pull request that sets `actions` and removes the caller leaves no
poster and fails closed: the required check is missing and blocks.)

Steps:

1. **Build and shadow, dev instance.** Sentinel computes the aggregate and posts under `ci / Required checks (sentinel)`, not
   required, on this repo only. A report compares its verdict with the Actions verdict on the same SHA (a `doctor ci` row reading
   recent pull requests, or a log line). Exit criterion: **20 consecutive pull requests agree**, and the set includes a re-run
   of one leaf, a cancelled first batch (the #2171 case), a `codecov/*` status that arrives late, a skipped leaf and a missing id.
2. **Subscribe and permit** (`status`, `statuses: read`) on the dev instance, then on the production App by hand
   (`github-app.manifest.json` drives only new instances). Before the shadow, so the shadow tests the real inputs.
3. **Production shadow**, same criterion, 10 pull requests.
4. **Flip, one pull request, this repo.** The setting becomes `sentinel`; the generated files change (the caller and reusable
   copy go away); the Sentinel deploy carrying the post-under-the-real-name path is **live before the merge** (the order of
   #2263: deploy first, then merge, back to back; do not merge during a Sentinel deploy). The flip pull request's own head has
   `sentinel`, so it is the first to test the live path.
5. **Catch-up.** After the merge, `holocron reconcile ci` runs once by hand over the open pull requests, because those on an
   old head still have the Actions result and will not get a Sentinel event until their next push. They are on `actions`
   heads, so Sentinel stays silent on them; the catch-up is needed only for heads that flip to `sentinel` by rebasing, and the
   sweep covers it. State this in the pull request so nobody expects it to repost old heads.
6. **Pin the source** (separate phase, after a week with no repair beyond grace and the bypass answer).
7. **Rollback** is a revert of the flip pull request (setting back to `actions`, files regenerated). It has the same ordering
   rule: the Actions caller is back on the head before Sentinel stops posting the real name, and the setting is read per head, so
   the two never overlap on one commit.

## Effects on existing parts

- **`probe generated check`**: generates `ci.ci.yml` from the config; with `sentinel`, the expected generated set has no caller
  and no reusable copy, and a stale caller is a failure, which is what enforces "one poster per commit".
- **`doctor ci`**: the `aggregate` row compares the caller's `expected` with `aggregateChecks()`. With `sentinel` there is no
  caller, so the row becomes "Sentinel is declared the poster; the expected list derives from the config" and compares against
  the **live** run of the latest merged commit's `ci / Required checks` (its `expected` named in its summary), never a skip. A
  skip would hide drift.
- **Thin caller `ci.ci.yml`**: removed under `sentinel`; kept under `actions` with no change until phase 11.
- **`repo.protection` / ruleset**: no change to contexts (the name is the contract). The optional source pin is the later phase.
  `requiredChecks(config, aggregate)` still returns `ci / Required checks` and `DCO`.
- **The registry**: the `ci` entry gains a way to say "posted by Sentinel". `sentinel: true` today means a leaf with no caller;
  the aggregate needs its own marker driven by the setting, not a second boolean on the task.
- **`#prs` feed and board status**: they key off a completed `ci / Required checks` `check_run` event. If Sentinel posts it, they
  can run from the same invocation (no webhook round trip, no dependence on receiving its own events), or Sentinel must receive
  its own `check_run` events (unverified). **Decided:** call them in-process after the post.

## Safety: a wrong success lets a red pull request merge

A bug that posts `success` when a check is red, missing or pending is the one failure that matters; the design makes it fail
closed and states the tests that must exist **before** Sentinel posts the real name.

Rules the code follows:

- Any exception, empty list, truncated page (more than 1,000 runs) or API error posts nothing or posts `failure` /
  `in_progress` with the reason, **never `success`**. `success` is the result of a function that must see every expected row
  succeed.
- The function is pure and has no clock, no network and no GitHub types beyond a plain row shape.
- The payload's conclusion is never read.

Tests (vitest, in `@theholocron/astromech`, proving the property rather than examples alone):

1. **An independent oracle.** A table-driven generator enumerates the cross product of states (success, failure, cancelled,
   neutral, skipped, in_progress, missing; one or two runs of a name with different `started_at`; a status as run or as
   commit status) for up to three expected ids plus two statuses, and asserts `conclusion === "success"` **iff** every id and
   status is satisfied, using an oracle written differently from the function (no shared helpers).
2. **Monotonicity.** For every success fixture, replacing any single row with failure, missing or pending never yields
   `success`; and an `expected` list with an id added that no run posts never yields `success`.
3. **Timeout.** Pending and missing before the deadline are `pending`; at and after, `failure` with "never posted" / "timed out";
   never `success`.
4. **Fail closed.** Empty `expected`, an unparseable name, a page cap hit and a thrown read each yield `failure` or `pending`.
5. **Conformance with the jq.** Shared fixtures (the cases #2171 fixed and one per row above) are run through **both** the
   workflow's jq program (extracted and run by `jq` in the test) and the TypeScript, and the verdicts must be equal. This is
   what lets the fallback and the new path share a contract for the whole period they coexist. The test fails if the jq
   changes without the function.
6. **Sentinel posting.** A handler test with a fake client that asserts, for each trigger, that the posted conclusion equals
   the function's, that a redelivery posts nothing new, that a read error posts no success, and that two interleaved
   deliveries converge on one run.
7. **Sweep.** A fake of `listPullRequests` / checks showing that a stale or wrong stored `success` is replaced by the
   recomputed `failure` (the sweep corrects a false success as well as a stale `in_progress`), and a matching one is untouched.

A false success can still arise from a wrong `expected` (the config read) rather than the function; hence base-ref reading and a
`doctor ci` row comparing the posted run's list with `aggregateChecks()`.

## Risks

- **A false `success`** (above): mitigated by fail-closed rules, the oracle and monotonicity tests, the jq conformance and the
  `doctor ci` comparison.
- **Sentinel is a single point of failure for merging.** It already is for five checks, but a silent outage was cheaper to see
  when the aggregate failed with a "never posted" table. Mitigated by the sweep (independent of the webhook route), the
  heartbeat and `#alerts`.
- **The sweep's App credential in a second workflow** widens who can post the check; mitigated by schedule-only use, and fully
  closed by a ruleset pin plus a protected environment holding the key (a follow-up, not recommended to block on).
- **Same-name double posting during the flip** is avoided by the per-commit switch; its failure mode (a hand-edited head with
  both) is caught by `probe generated check`, and by the shadow criterion.
- **Event volume.** A push creates dozens of `check_run` events. They are dropped by name before any fetch; the Vercel CPU
  cost (#945) is not measured. If it is too high, widen the filter to "expected names only" plus the sweep as the backstop.
- **Required check missing at the flip** if the deploy and the merge are out of order: stated order, and the flip pull request
  is the first to test the live path.
- **Unverified GitHub behaviour** (below) could change phases 3 and 5; each is checked on the dev instance first.

## Phased plan

Small issues, in order. Sizes: S under a day, M a few days, L a week.

1. `feat(astromech): ✨ evaluate the ci aggregate in a pure function` (M). The function, fixtures, the oracle and monotonicity
   tests, and the jq conformance test. No behaviour change anywhere.
2. `feat(cli): ✨ holocron reconcile ci` (M). Read-only first (`--dry-run` prints the verdict and what it would post), then the
   post as the Sentinel App. Usable by hand for one pull request. Blocked by 1.
3. `feat(sentinel): ✨ post the ci aggregate in shadow on the dev instance` (L). `pull_request`, `check_run` completed and
   rerequested, `status` subscription and permission (human step), base-ref `expected`, find-or-create with convergence and
   verify-after-write; posts `ci / Required checks (sentinel)`. Blocked by 1.
4. `feat(cli): ✨ compare the shadow with the actions aggregate in doctor ci` (S). The agreement report and the exit criterion.
   Blocked by 3.
5. `feat(astromech): ✨ a repo setting says who posts the ci aggregate` (M). The setting, caller generation, `probe generated
check`, `doctor ci` row, registry marker. Default `actions`, so no generated file changes. Blocked by 1.
6. `ci: 👷 reconcile-ci, the scheduled sweep` (M). Registry task, reusable, caller, heartbeat, `#alerts` entry; a stale-over-grace
   repair fails the run. Blocked by 2.
7. `feat(cli): ✨ holocron redeliver webhooks and a doctor row for failed deliveries` (M). Blocked by nothing; useful beyond the
   aggregate.
8. `feat(sentinel): ✨ post the real name when the head's setting is sentinel` (M). Blocked by 3, 4 (agreement met), 5, 6.
9. `ci: 👷 flip this repo to Sentinel for the ci aggregate` (S, human steps: production permissions, deploy first, merge). The
   flip pull request, the catch-up, the rollback written. Blocked by 8.
10. `feat(cli): ✨ pin the required ci check to Sentinel's app` (M). Ruleset writer, `read-repo`, `doctor repo`, preset option.
    After 9 and after #1478 is answered.
11. `chore(ci): 🔥 remove the polling aggregate` (S). The reusable, the caller generator, the jq and its conformance test, after
    the stated fallback period. Blocked by 9 and the period.

## Options considered

| Option                                                                                                        | For                                                                 | Against                                                                              |
| ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| 0. Keep polling in Actions                                                                                    | Nothing to build; the check explains outages                        | The idle runner and the re-run gap stay; the stated direction is not met             |
| 1. Sentinel posts; Actions deleted at once                                                                    | Simplest end state                                                  | Silent failure when Sentinel is down; no lost-event or timeout handling; no rollback |
| **2. Sentinel posts; shared function; the five recovery paths; per-commit switch; Actions kept for a period** | Meets the direction; failure is loud; the shadow proves equivalence | Most to build; two implementations coexist, held together by shared fixtures         |
| 3. As 2, plus the ruleset pins Sentinel's app                                                                 | Only Sentinel can satisfy the required check                        | Needs ruleset and doctor changes; harder to bypass an outage without a bypass role   |

**Recommendation: option 2, then option 3 as phase 10.**

## Decisions on the open questions

Answered by the maintainer on 2026-11-22.

| #   | Question                     | Decision                                                                                                                                                |
| --- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Pin timing                   | Phase 10 (the pin) comes after #1478 is answered, not right after the flip.                                                                             |
| 2   | Fallback bar before phase 11 | Two weeks and 20 merged pull requests, with no sweep repair beyond the grace.                                                                           |
| 3   | Sweep cadence and grace      | Every 15 minutes, 10 minute grace; heartbeat period 1 hour, grace 2 hours.                                                                              |
| 4   | Where `expected` is read     | The base ref. A task a pull request adds gates only after it merges.                                                                                    |
| 5   | `status` subscription        | Yes. A human step: an owner accepts `statuses: read` and the `status` event on each installed App.                                                      |
| 6   | The setting's place          | A top-level `ci` key: `ci: { aggregate: "actions" \| "sentinel" }`.                                                                                     |
| 7   | Bypass role                  | The existing Write-role bypass (`always`) is the escape hatch the runbook relies on. Whether id 4 is Write is from memory, not read from GitHub's docs. |
| 8   | Self-delivery                | Sentinel calls the feed and board-status handlers in-process after posting.                                                                             |
| 9   | Merge queue                  | Not used and not planned; out of scope (see Non-goals).                                                                                                 |
| 10  | Sweep credential             | The Sentinel App's own key, with an installation token narrowed to `checks: write`, `pull_requests: read` and `statuses: read`.                         |

## Not verified

- That `RepositoryRole` id 4 in the ruleset's bypass list is the Write role (read from the ruleset API on 2026-11-22; the id mapping is from memory).
- That GitHub accepts a `permissions` subset when minting the sweep's installation token for a check run write.
- That GitHub sends `check_run.rerequested` for a check run created through the API to its owning app, and shows Re-run on it
  when no custom actions are set.
- That GitHub delivers `check_run` events for runs created by another app to an App with `checks` permission. The code relies on
  it (the `#prs` feed and board status read the Actions app's `ci` run); no test proves it and GitHub's documentation was not
  read for this spec.
- That an App receives `check_run` events for its own runs.
- How GitHub evaluates a required context when two apps post the same name on one commit, and that `status: in_progress` can be
  set again on a completed check run.
- The ruleset API's `integration_id` field and its behaviour, known only from memory of GitHub's API. Phase 10's code now
  writes it (`setup`), reads it back (`read-repo`) and compares it (`doctor repo`'s `repo-ci-pin` row), all against
  hand-written fakes shaped from that memory; no live ruleset has been written or read with it, and whether GitHub accepts,
  returns and enforces it as assumed is still unverified.
- That GitHub does not redeliver failed webhooks itself, and the exact endpoints, auth and retention of the App delivery log.
- That a Sentinel production App can have its permissions and events edited without reinstalling (the README says
  subscriptions are set by hand on an existing App).
- Whether Sentinel's config read loads plugins (affects `statuses`), and what the Vercel cost is per `check_run` invocation.
- That production Sentinel is currently up: taken from `tech-board-status-automation` and AGENTS.md, not from a live check.
- Whether Codecov posts check runs, commit statuses or both for this repo.
