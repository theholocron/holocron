---
id: SPEC-0091
status: accepted
issue: theholocron/holocron#2263
blocked-by: []
related:
  - theholocron/holocron#2096
  - theholocron/holocron#2036
  - theholocron/holocron#2037
  - theholocron/holocron#2203
  - theholocron/holocron#945
discussion:
  url: https://discord.com/channels/1303969001822486568/1571991764489736344
---

# What Sentinel runs, and what GitHub Actions runs

## Problem

Sentinel and the Actions workflows post checks for the same tasks. `ci-sentinel-check-names` (SPEC-0076, #2036) calls
Sentinel "the whole CI experience" and plans to remove the Actions twins after a month, once Vercel's cost is known (#2096).
Two things have changed since:

- The cost question is answered: Sentinel's hosting cost is acceptable.
- The monorepo import brought the per-package tool configs back (`tsdown.config.ts`, `vitest.config.ts` and the rest), because
  the packages call their tools directly. #763 and #765, which assumed those files could go, are closed as not planned.

So the work is no longer "move everything to Sentinel". It is to say which side owns which check, so the twins can be removed
without removing a check that only Actions can run.

## Decision

**Sentinel runs what needs only the pull request's diff and the GitHub API, answers in seconds, and can fix by pushing a
commit.** It reads the org's canonical config, never the repo's own files. **Actions runs what needs a checkout, a
toolchain, secrets, or more than about a minute.**

Why the line is there, not further toward Sentinel:

- Sentinel is a serverless function billed on CPU time and deploy count (#945). Installing dependencies, type checking,
  testing and building inside it is the expensive part, and it has no cache.
- A release is a workflow: npm trusted publishing is registered against the calling workflow's file name.
- Every other repo gets its CI from thin callers into the reusables, and Sentinel covers only the repos it is installed on.

### Sentinel owns (10 checks)

| Check (after the prefix goes)                                                        | Notes                                                              |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| `validate:config / Run Holocron config compatibility`, and its `(pull_request)` form | no Actions twin                                                    |
| `validate:dco / Run Developer Certificate of Origin`                                 | no Actions twin; the required `DCO` check is the probot app's      |
| `lint:commits / Run commitlint`                                                      | twin removed                                                       |
| `validate:specs / Validate ADRs and specs`                                           | twin removed                                                       |
| `validate:docs / Validate docs`                                                      | twin removed                                                       |
| `format / Run prettier`                                                              | with its auto-fix commit; `format` has no Actions check of its own |
| `lint:editorconfig / Run editorconfig`                                               | twin removed, with its auto-fix commit                             |
| `lint:markdown / Run markdownlint`                                                   | twin removed, with its auto-fix commit                             |
| `lint:language / Run alex`                                                           | no Actions twin                                                    |

It also keeps what is not a check: the custom-properties sync, role sync, the `#prs` feed and the auto-fix loop.

### Actions owns

`typecheck`, `build`, `test:*`, `lint:code` (eslint, actionlint and prettier together), `lint:data`, `lint:unused`,
`scan:*`, `validate:deps`, `validate:generated`, `measure:*`, `release`, `deploy*`, and the scheduled tasks (`sync-*`,
`check-tokens`, `doctor-tokens`, `reconcile-projects`, `sync-issues`).

### What Sentinel stops posting

`lint:code / Run eslint`, `lint:code / Run actionlint` and `typecheck / Run tsc --noEmit` (three of the 13). Sentinel's eslint
is a real, in-memory pass over the changed files with the org's `library()` bundle and nothing else, so it needs no checkout;
but it cannot know the repo's own config (a browser or React profile, a package's overrides), while the Actions `lint:code`
runs the repo's own eslint, actionlint and prettier. Two answers to one question under one task id is the problem, not the
cost of either. The typecheck is already a workflow that Sentinel dispatches. A repo that wants these checks takes the thin
callers, as every other repo does. If Sentinel's eslint is later shown to agree with the repo's own, it can return under an
id of its own.

## Cutover

The risk is a required check that waits for a name nothing posts, or two checks of one name where only the newest counts
(#2171). This repo's ruleset requires `ci / Required checks` and `DCO`, so only the aggregate's `expected` list matters
here.

1. **Say which tasks Sentinel runs.** A task entry takes `sentinel: true` (`TaskEntry.sentinel`): no thin caller is written,
   but the task stays in `holocron run ci` and, with `required: true`, in the aggregate's `expected` list. `ci: false` was
   not enough: it also takes the task out of `holocron run ci`, so the pre-push hook would stop running it.
2. **Make Sentinel post what it is meant to post here.** Sentinel posted neither `validate:specs` nor `validate:docs` for this
   repo: its gate was the exact task name `platform.repoValidation`, and this repo's config names the flat ids. The gate
   (`declaresRepoValidation()`) now accepts `validate`, `validate:specs`, `validate:docs` and the old name. Without this the
   aggregate would wait for two names nothing posts.
3. **Sentinel, in one change:** the `sentinel:` prefix goes (the constant itself, and not only its value, since nothing is left to
   tell apart), and the docs that quote the names are updated. The eslint, actionlint and typecheck checks were removed
   first (#2265), so the prefix change cannot make two checks share a task id.
4. **This repo, in the same pull request:** the five tasks are marked `sentinel: true` and their callers are removed
   (`lint:commits`, `lint:editorconfig`, `lint:markdown`, `validate:specs`, `validate:docs`). The reusables stay: other repos
   and a later `ci-v1` use them. Merge and deploy back to back: between the merge and the deploy the aggregate waits for
   names the old Sentinel posts with a prefix.
5. **The private repos' rulesets** were never read. Check them for a required check that uses a `sentinel:` name.
6. **Other repos** are on the legacy gate and keep their old Actions check names, so the bare names do not clash there.
   Confirm on one repo.

A Sentinel check that is `neutral` (the docs check at worst) satisfies the aggregate, which accepts success, skipped and
neutral.

## Out of scope

- Moving any Actions task into Sentinel.
- Sentinel's hosting (#945) and the deploy cadence (#2203).
- Other repos' callers: they follow `CI_HOME`, as before.

## Acceptance criteria

- Sentinel posts ten checks under bare task ids, none under `sentinel:`.
- This repo has no Actions workflow for the five twins, and a fresh pull request passes `ci / Required checks`.
- `lint:code` and `typecheck` are posted once each, by Actions.
- Sentinel posts `validate:specs` and `validate:docs` for this repo.
- `holocron run ci` still runs the five tasks locally.
- The `ci-sentinel-check-names` spec's "Removing the prefix" section points at this one.
