---
status: archived
issue: theholocron/holocron#2251
blocked-by: []
related:
  - theholocron/holocron#1859
  - theholocron/holocron#1744
---

# Schedule the issue sync and map assignees between trackers

## Problem

`holocron sync issues` (SPEC-0071 section 4) keeps one tracker up to date from another, one direction, but only when someone runs
it. Two things the spec left out keep it from being a thing a repo can leave on:

1. **No schedule.** `reconcile-projects` and `check-tokens` run from a reusable workflow and a thin caller; `sync issues`
   has neither, so the "run both trackers while Linear is trialled" use needs a person to remember.
2. **No assignee across the GitHub to Linear line.** Linear to GitHub drops the assignee (`assignee (not mapped)`), because a
   Linear user carries an email and a GitHub account is a login, and nothing says which is which.

## Decision

### The `sync-issues` task

A registry task, reusable workflow and thin caller, as every scheduled job is (`ci-jobs-as-templates`):

- Registry: `"sync-issues": { group: "Platform", scope: "repo", local: { command: "sync issues" } }`.
- Reusable `ci/workflows/sync-issues.yml`, `on: workflow_call` with inputs `from` and `to` (required, the `sync issues`
  endpoint syntax, `github`, `linear:team=ENG`), `since` (default `2d`, so a run reads only what changed lately) and `both`
  (boolean, default `false`).
- With `both`, the same job then runs the swapped direction, after the first, so the two never overlap. `concurrency` is
  one group per workflow, `cancel-in-progress: false`.
- The thin caller is generated from the task's `with:` (`{ name: "sync-issues", with: { from, to, both } }`) and runs hourly
  plus `workflow_dispatch`. A repo gets it only by listing the task, so a repo with no second tracker is untouched, and this
  repo does not list it.
- Tokens: the Linear token reaches the job as the secret `HOLOCRON_LINEAR_TOKEN` (`secrets: inherit`), and GitHub's
  as the job's own `GITHUB_TOKEN` with `issues: write`. Neither goes on a command line.
- A failed run reaches `#alerts` through `platform.notifications.yml` (the task id is added to its list).
- The run is `holocron sync issues --yes --since <since>`, so it creates nothing twice (the loop guard and the recorded
  address are SPEC-0071's).

### The assignee map

A file of pairs, like the Discord links file, in the org's private config repo, so a pairing is not public:

- Path: `<org>/.github-private`, `issues/assignees.json` (the `source` provider reads it with `readFile`, the way
  `readLinks()` reads the Discord file). Shape: `{ "version": 1, "links": [{ "login": "octocat", "email": "a@b.dev" }] }`.
- Unlike the Discord file there is no sign-in flow to write it: both ends are readable by the org, so a maintainer edits it by
  hand. `parseAssignees()` throws on anything that is not that shape, so a damaged file is never treated as empty; a login or an
  email may appear once, and emails compare lowercased.
- `sync issues` reads it once, and only when a source record has an assignee, then rewrites each record's assignee before it
  hands the records to the target: to a GitHub target the login from the email, to a Linear target the email from the login.
  A name with no pair is reported as `assignee (not mapped)`, as before, and is never a failure. A file that does not exist is an empty map.
- A GitHub target sets the assignee only when the record carries a mapped login, and, as for Linear, never clears one.

### Out of scope

- The built-in `roadmap` template's Priority options (`1 · Now`...). They do not match the neutral levels, but how they
  should map is the maintainer's board convention; it stays open as SPEC-0071 left it.
- Linear issue templates and the links of a sync a rate limit stopped. Unchanged.

## Testing

Pure functions tested alone (`parseAssignees()`, `mapAssignee()`); `runSyncIssues()` with an injected `source`; the task in
`check-names.test.ts`, the legacy-callers table, a run test and a template-content test; `holocron probe generated check`
stays clean.

## Acceptance criteria

- A repo that lists `sync-issues` with `from: github`, `to: linear:team=ENG` gets `ci.sync-issues.yml`, and the run is
  idempotent.
- A Linear issue assigned to a person in the file reaches GitHub assigned to that login, and a GitHub issue assigned to a
  login in the file reaches Linear assigned to that email.
