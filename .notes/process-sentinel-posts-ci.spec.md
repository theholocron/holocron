---
status: draft
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
---

# Sentinel posts the `ci` aggregate check itself

## Problem

The one required check, `ci / Required checks`, is a GitHub Actions reusable workflow (`ci/workflows/ci.yml`). It polls the
Checks API every 30 seconds for the head commit until every expected check has completed, or 30 minutes pass. That costs a
runner for the whole wait (up to the 45 minute job limit), and it has a limitation that SPEC-0064 accepted: re-running one
leaf does not update `ci`, which stays red until `ci` is re-run too.

SPEC-0064 (`ci-flat-task-vocabulary`, #1262), in its decided Q3, records that the maintainer wants Sentinel to post `ci`
itself, as a direction only, and says it needs its own spec. Its earlier text explains why it was not done then ("Sentinel
is down, #1100") and that "the `ci` context name and the `expected`/`statuses` lists are the contract, so swapping the
implementation changes no ruleset". This spec tests that last claim, because the code does not fully support it (see "Who
may post the check").

This spec is the design. It builds nothing.

## What exists today (read from the repo)

- **The aggregate** (`ci/workflows/ci.yml`): `expected` is a list of task ids; each needs a check run whose name starts with
  `<id> / `, all of them completed. `statuses` is a list of contexts (`codecov/patch`, ...), each accepted as a check run
  named like the context, else as a commit status. `success`, `skipped` and `neutral` pass. An id with no run at the
  timeout fails as "never posted". Only the newest run of each check name counts (latest `started_at`, then `id`, #2171).
  The job never waits for itself (it drops `ci` from `expected`).
- **Where the lists come from**: `aggregateChecks()` in astromech derives `expected` and `statuses` from the config's
  `required: true` tasks and `extraRequiredChecks`, and `aggregateCaller()` writes them into the thin caller as `with:`.
  The caller is written as `ci.ci.yml` only in the repo that contains the reusables, so **this repo is the only repo with an
  aggregate today**. Other repos are on the legacy gate and keep per-task required checks.
- **Sentinel already runs five of the expected checks** (`lint:commits`, `lint:editorconfig`, `lint:markdown`,
  `validate:specs`, `validate:docs`, #2263; `sentinel: true` tasks have no caller but stay in `expected`). So the aggregate
  can already not pass while Sentinel is down.
- **Sentinel's subscriptions** (`apps/sentinel/github-app.manifest.json`): events `check_run`, `membership`,
  `organization`, `pull_request`, `pull_request_review`, `push`. Permissions include `checks: write`; there is no `status`
  or `check_suite` subscription and no `statuses` permission.
- **Sentinel already reads the aggregate**: `parseWebhookEvent()` drops every `check_run` except a completed one named
  `ci / Required checks` (`SENTINEL_PR_FEED_CHECK_NAME`), which feeds the `#prs` feed (#1738) and board status (#2388). The
  first fact worth noting is that those two features only work if Sentinel receives check runs that the **Actions app**
  created. That is the evidence in the code that a check run from another app is delivered to Sentinel; it is not proof
  from GitHub's documentation (see "Not verified").
- **Rulesets name a context only.** `setup/branch-protection.ts` writes `required_status_checks` as `{ context }` entries
  and nothing else; no code in the repo sets an `integration_id` (the required check's source app), and `doctor repo`
  compares contexts only (`compareRequiredContexts`). So today any app may satisfy `ci / Required checks`.
- **Liveness**: Sentinel has no health endpoint. Two Checkly checks watch the webhook (a GET answers 405, an unsigned POST
  401). SPEC-0064 says a health endpoint "would only add whether Sentinel can reach the GitHub API".

## Goals

- `ci / Required checks` is posted by Sentinel from webhooks: no idle runner, no polling, and a re-run of one leaf updates it.
- Same contract as today: the same context name, the same `expected` and `statuses` meaning, the same newest-run-wins rule,
  the same pass set, the same failing-first summary with links.
- No window, at any step of the migration, in which the required check is missing or can be satisfied by something that
  should not satisfy it.
- When Sentinel is down, a person learns it and can still merge, by a path that is written down and audited.

## Non-goals

- Moving any other task between Sentinel and Actions (that is `process-sentinel-and-actions-roles`, #2263).
- Other repos' rulesets or callers. They have no aggregate yet and follow `CI_HOME`.
- Changing `DCO`, which stays its own required context.
- Sentinel's hosting and deploy cadence (#945, #2203).

## What Sentinel would compute

On a trigger for a pull request's head SHA, Sentinel reads the state from the API, never from the webhook payload (the rule
the `#prs` feed already follows), and runs one pure function:

1. List the head commit's check runs (`checks.listCheckRunsForRef()` exists in `@theholocron/github-client`) and, for
   `statuses`, the combined commit status.
2. Keep the newest run per check name (the #2171 rule, same sort key).
3. For each `expected` id, find runs named `<id> / ...`, and classify as success, failure, pending or missing; for each
   `statuses` context, as a check run named like it, else a commit status.
4. Post or update one check run named `ci / Required checks`: `in_progress` while anything is pending or missing, then
   `completed` with `success` or `failure`, whose output is the same table (failures first, links) and whose annotations are
   the same `::error`-style entries as check annotations.

The function is the part worth sharing. Today the logic is a `jq` program inside a workflow, which is untestable in vitest and
cannot be reused. The spec's recommendation is one TypeScript function in `@theholocron/astromech` (next to
`aggregateChecks()`, which already produces its inputs, and which Sentinel already depends on), covered by tests that
replay the cases #2171 fixed. Whether the Actions fallback should call that function too is a question below.

### Triggers

| Event                                                          | Why                                                             | Cost/risk                                                                                                          |
| -------------------------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `pull_request` opened, synchronize, reopened, ready_for_review | Post `ci` as `in_progress` at once so the required check exists | Already subscribed                                                                                                 |
| `check_run` created and completed                              | A check settled (or a new one appeared): recompute              | A push makes dozens of runs; today they cost nothing because they are dropped before any fetch                     |
| `status`                                                       | `codecov/*` statuses that are not check runs                    | Not subscribed; needs the `statuses: read` permission (an App permission change an installation owner must accept) |
| `check_suite` completed (optional)                             | Coarser than `check_run`, fewer invocations                     | Not subscribed; GitHub groups runs by app, not by our ids, so it is not a substitute                               |

The `check_run` row is the cost problem: every run of every check on a push would invoke the function. Mitigation: parse the
check name from the payload and drop a run whose name matches no `expected` prefix before fetching anything. That needs
`expected` before the fetch (see "Where `expected` comes from"). The CPU cost in Vercel's billing (#945) has not been
measured; see "Not verified".

### Where `expected` comes from

Three ways, not equivalent:

- **A. The config at the head ref**, through `aggregateChecks()`. Matches how the caller is generated, so it cannot drift.
  Sentinel already reads the config at the PR's ref for the config check. But `statuses` also depends on the coverage
  provider's `statusContexts()`, which needs the provider plugin loaded; whether Sentinel's config read loads plugins is not
  verified, and without it astromech falls back to the `codecov/` prefix rule (a behaviour the code keeps on purpose).
- **B. The committed thin caller** (`.github/workflows/ci.ci.yml` `with:`), read at the head ref. One source, no plugin load,
  but it makes a generated workflow file a runtime input, and the file would be removed at cutover (below).
- **C. A new, small committed file** (names only) written by `holocron sync` / `setup`. Cleanest contract, one more generated
  file and one more `probe generated check` surface.

## How it differs from polling

| Concern                      | Polling (today)                                           | Sentinel from webhooks                                                                                                                                             |
| ---------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Latency after the last check | Up to 30 s (poll interval)                                | Seconds: one delivery plus one API read                                                                                                                            |
| Cost                         | A runner for the whole wait                               | One short invocation per relevant event                                                                                                                            |
| Re-run of one leaf           | Does not update `ci` (accepted limitation)                | Updates it, because the re-run's `check_run` events trigger a recompute                                                                                            |
| Event ordering               | Not a concern: it reads the whole state each poll         | Deliveries can arrive out of order. Fixed by recomputing from the API every time, and ignoring the payload's conclusion: the function is idempotent and order-free |
| Redelivery                   | Not applicable                                            | Safe for the same reason; a redelivered event recomputes the same table. Posting must update the existing run, not create another                                  |
| A missed or lost delivery    | Cannot miss: it polls                                     | **Real gap.** A lost final `check_run.completed` leaves `ci` `in_progress` forever. Needs a catch-up path (below)                                                  |
| The 30 minute timeout        | Local clock in the job                                    | **Real gap.** No event fires when nothing happens, so "never posted" cannot be detected from webhooks alone. Needs a sweeper (below)                               |
| Concurrent invocations       | One job                                                   | Two deliveries for one SHA can run in parallel on a serverless host (no lock). Both may find no existing run and both create one. See "Duplicate runs"             |
| Explaining a failure         | The job summary and a `::error` annotation per failing id | A check run `output` (title, summary, annotations): the same information, in the check's own details page                                                          |
| Codecov statuses             | Polls the commit-status API                               | Needs the `status` subscription and permission, else it relies on Codecov's check run alone                                                                        |

### Duplicate runs

Two parallel invocations can each create a `ci / Required checks` run for the same SHA. The #2171 rule makes the newest run
count in our own table, but GitHub's required-check evaluation is not ours. Mitigation, copied from the pattern
`convergeCreatedIssue()` already uses for ideas: after creating, list again, keep the oldest as the one to update, and
complete the extra ones as `neutral` with a note. Posting through `external_id = <head sha>` makes the lookup cheap.

### Catch-up: lost events and the timeout

Webhooks tell Sentinel something happened; they cannot tell it something failed to happen. Two mechanisms are needed, and
the spec lists the options rather than picking:

- **T1. An Actions watchdog**, scheduled every 5 to 10 minutes (or `pull_request`-triggered with a 35 minute wait), which
  looks for an open pull request whose `ci / Required checks` is still `in_progress` past the deadline and completes it as
  failed ("never posted: names"), or posts nothing and fails its own non-required check. GitHub delays and drops scheduled
  runs (the heartbeats section of `tech-monitoring-dashboards-status-pages` already says so), so this is best-effort.
- **T2. A Sentinel-side sweeper**, a scheduled invocation of the same function over open pull requests. Needs a scheduler for
  Sentinel; Sentinel deploys by file upload (`deployFunction`), and whether Vercel cron applies to that kind of deploy is not
  verified.
- **T3. Lazy healing only**: any later event for the PR recomputes, and nothing sweeps. A pull request that never gets
  another event stays `in_progress`, which blocks the merge button with no explanation. Cheapest; the failure is silent.

For lost deliveries specifically, GitHub's App webhook delivery log can list and redeliver failed deliveries
(`/app/hook/deliveries`), which needs an App JWT. A `holocron` command that redelivers failures since a time would also give
the recovery step after an outage. Not verified that the endpoints and their retention are as assumed.

## What happens when Sentinel is down

Be precise about what changes. Today, with Sentinel down:

- the five Sentinel-owned checks never post, so the Actions aggregate waits 30 minutes and then fails with a table that
  names them as "never posted". That table is the diagnosis.

With Sentinel posting `ci`, the same outage means:

- `ci` is never posted, or stays `in_progress` after the last event before the outage. Nothing explains why, unless something
  else does. Fail-closed is correct (a down gate must not pass), but the silent version is worse than today's.

So the spec requires an **explainer even in the recommended design**: a non-required Actions check (the watchdog, T1) that
says "Sentinel has not posted `ci` for this commit after N minutes" and links the runbook. It is also what gives a person
something to see.

Liveness: the two Checkly checks prove the webhook route answers (405 and 401), not that Sentinel can post checks or read the
API. A cheap strengthening that fits "no health endpoint" is the watchdog above plus a Checkly heartbeat
(`monitoring` heartbeats exist, #2359) pinged by Sentinel when it completes a `ci`, with a period that fits the repo's
traffic. That is an idea, not a requirement; a quiet repo for a day would page, which is wrong. See the open questions.

Merging while Sentinel is down is a ruleset bypass (a person with the bypass role merges). SPEC-0064 leaves open whether a
bypass role is needed on every repo, waiting on #1478 (phase K). This spec does not decide that, but it depends on the answer
for its runbook: if the bypass role exists, the runbook is "bypass, then run the recovery command"; if not, an outage blocks
every merge until a maintainer edits the ruleset.

## Who may post a check named `ci / Required checks`

Any GitHub App with `checks: write` can post a check run with any name. GitHub lets a ruleset pin a required check to an
`integration_id`; this repo never sets it (see above). Consequences:

- **Today**, nothing prevents another app, or a workflow, from posting a green `ci / Required checks`. It is a trust-the-org
  assumption, not a control.
- **During a migration** with both the Actions job and Sentinel posting the same name, the ruleset sees two runs from two
  apps for one context. How GitHub combines them (any success, the newest, the worst) is not verified here, and the repo's
  own #2171 rule only describes our aggregate's reading, not GitHub's. The migration below avoids ever depending on it.
- **After cutover**, pinning the required check to Sentinel's app id would make Sentinel the only identity that can satisfy
  it, which is the point of the move. It needs: `setup`'s ruleset writer to accept a source (it writes `{ context }` today),
  `read-repo` and `compareRequiredContexts` to read and compare it, and an answer for the **dev Sentinel instance**
  (`githubApps` lists two instances with two app ids; a dev instance installed on this repo would post a different identity).
  The pin is an extension of the code, not a configuration.

The consequence for SPEC-0064's claim ("swapping the implementation changes no ruleset"): true for the context name, false
if we want the identity pinned. It is a choice, below.

## Migration with no missing-check window

The invariant: on every commit of every open pull request, there is exactly one trustworthy `ci / Required checks` result.

1. **Shadow.** Sentinel computes the aggregate but posts it under a different name, `ci / Required checks (sentinel)`,
   not required. Nothing changes for merges. A report (a log line, or a `doctor` row reading recent PRs) compares the
   shadow's verdict with the Actions aggregate's verdict on the same SHA. Exit criterion: N consecutive pull requests agree,
   including a re-run, a cancelled batch (the #2171 case), a codecov status, a skipped leaf and a missing id. N is an open
   question.
2. **Subscribe and permit.** Add `status` (if chosen) and `statuses: read` to the manifest and to the production App by hand
   (`github-app.manifest.json` only drives new instances; the existing App's changes are accepted by an owner). Do this
   before the shadow, so the shadow tests the real inputs.
3. **Cutover, one pull request.**
   - Sentinel posts under the real name.
   - The Actions aggregate is renamed (job name, caller, or both) so it no longer posts `ci / Required checks`, and stays as
     the non-required watchdog `ci / Required checks (actions)` that fails loudly when Sentinel's is missing or stale. The
     ruleset still lists `ci / Required checks`, which now has exactly one poster.
   - A catch-up pass posts `ci` for every open pull request at the new head SHA, because those had the Actions check and
     will not get a Sentinel `pull_request` event until their next push. Without it, an open PR on an unchanged head has no
     result after the cutover, which is the window to avoid.
   - Order matters and is not atomic: merge the workflow rename and deploy Sentinel together, as #2263 did for the prefix
     removal ("merge and deploy back to back"). Until Sentinel's deploy is live, the required check is missing on new pushes.
     State the order in the PR and do not merge during a Sentinel deploy.
4. **Pin the source** (if chosen), after a week with no surprise: ruleset `integration_id` = Sentinel's app id.
5. **Rollback** is symmetric and written before step 3: restore the Actions caller's name, and stop Sentinel posting under the
   real name (an environment switch, not a redeploy, so it takes effect in minutes). The switch itself is a new setting,
   and its secret-free design is an open question.

This repo's generated files change at cutover (`ci.ci.yml`, `.github/workflows`, `probe generated check`), and `doctor ci`
has rows about the `ci` aggregate's `expected` and the callers; both need a reading of "Sentinel posts it". The task
registry's `ci` entry would need a way to say "posted by Sentinel" alongside `sentinel: true` (that flag means a leaf, not the
aggregate).

## Which repos

Only this repo has an aggregate now (the caller exists only where the reusables live). The recommendation is **this repo
only**, until `CI_HOME` moves to `ci-v1` and other repos adopt the aggregate; at that point the question is whether Sentinel
(installed per repo) or a reusable (copied per repo) is the better default, and that is a later spec. A repo where Sentinel
is not installed keeps the Actions aggregate, which is why the Actions job and its tests stay in the repo.

## Options and recommendation

| Option                                                                                                          | For                                                                                   | Against                                                                                                            |
| --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| **0. Keep polling in Actions.**                                                                                 | Nothing to build; the check explains outages; no new availability coupling            | The idle runner and the re-run gap stay; the maintainer's stated direction is not met                              |
| **1. Sentinel posts `ci`; Actions deleted.**                                                                    | Simplest end state                                                                    | Silent failure when Sentinel is down; no explainer; no lost-event or timeout handling                              |
| **2. Sentinel posts `ci`; Actions kept as a non-required watchdog; shared pure function; shadow-then-cutover.** | Meets the direction; failure is loud; the shadow proves equivalence before any change | Most to build (function, subscriptions, shadow report, watchdog, catch-up); two places still know the contract     |
| **3. As 2, plus the ruleset pins Sentinel's app id.**                                                           | Only Sentinel can satisfy the required check                                          | Needs ruleset-writer and doctor changes; dev instance question; makes an outage harder to bypass if no bypass role |

**Recommendation (a recommendation, not a decision): option 2, with option 3 as a separate follow-up once the bypass role
question (#1478) is answered.** Reasons: it is the only option that adds no new silent failure, the aggregate already
depends on Sentinel for five of its checks so the availability coupling is not new, and the shadow step turns "does it
agree with polling" into a measured fact instead of an argument. Pinning is deferred because it changes the failure mode of
an outage from "a stale check" to "no one can satisfy the check", and that trade is the maintainer's.

## Open questions (for the maintainer)

1. **Is a non-required Actions watchdog acceptable**, i.e. is it acceptable that Actions keeps a (cheap) job after the move?
   Or should the end state have no Actions aggregate at all (option 1), accepting a silent outage?
2. **Timeout and lost events:** T1 (Actions watchdog), T2 (Sentinel sweeper, needs a scheduler) or T3 (lazy, silent)? Is
   a deadline of 30 minutes still right now that nothing holds a runner?
3. **Where does `expected` come from:** A (config at the head ref), B (the committed caller) or C (a new generated file)?
   If A, may Sentinel's config read load the coverage provider, or is the `codecov/` prefix fallback acceptable?
4. **Pin the source (option 3)?** Now, later or never? If pinned, how is the dev Sentinel instance treated on a repo it is
   installed on?
5. **Does a ruleset bypass role exist** (#1478, SPEC-0064 Q11)? The runbook for an outage is different with and without it.
6. **Subscribe to `status`** (an App permission change an owner must accept), or rely on Codecov posting a check run and
   drop the commit-status path? What does Codecov actually post for this repo today?
7. **Agreement threshold for the shadow:** how many pull requests, and which cases must be among them, before cutover?
8. **Liveness:** is a Checkly heartbeat pinged by Sentinel on each completed `ci` worth its false alarms on a quiet day, or is
   the watchdog enough?
9. **Self-delivery:** the `#prs` feed and board status key off a completed `ci / Required checks` `check_run`. If Sentinel
   posts it, either those handlers run from the same invocation (no webhook round trip) or Sentinel must receive its own
   check run events. Which?
10. **Merge queue:** the aggregate's caller mentions `merge_group` "if used". Is a merge queue used or planned here? A
    `check_run` on a merge group commit carries no pull request, which this design does not handle yet.

## Not verified

- That GitHub delivers `check_run` events for runs created by another app to an App with `checks` permission. The code
  relies on it (the `#prs` feed and board status read the Actions app's `ci` run), and it works in practice if those
  features work; no test in this repo proves it, and GitHub's documentation was not read for this spec.
- That an App receives `check_run` events for its own runs (needed for question 9 if the answer is "receive").
- How GitHub evaluates a required context when two apps post the same name on one commit.
- That GitHub does not redeliver failed webhooks by itself, and the exact endpoints, auth and retention of the delivery log.
- That Vercel cron or any scheduler applies to Sentinel's file-upload deploy.
- The Vercel CPU cost and rate-limit effect of one invocation per relevant `check_run`; not measured.
- Whether Sentinel's config read loads plugins (affects "Where `expected` comes from", option A).
- The ruleset API's `integration_id` field and behaviour: known only from memory of GitHub's API, not exercised by any code in
  this repo.
- That the production Sentinel App can have its permissions and events edited without reinstalling (the README says the
  subscriptions are set by hand on an existing App, which suggests so for events).
- SPEC-0064's wording "Sentinel is healthy" is a statement of the maintainer in Q3, not something this spec checked.
