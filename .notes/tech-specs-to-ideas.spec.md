---
id: SPEC-0062
status: accepted
issue: theholocron/holocron#1534
blocked-by: []
related:
  - theholocron/holocron#1160
  - theholocron/holocron#1102
  - theholocron/holocron#1159
  - theholocron/holocron#929
discussion:
  url: https://discord.com/channels/1303969001822486568/1566618609030271199
---

# Post new and changed specs to #ideas

## Problem

Spec work happens in pull requests that only the repo's watchers see. A post in #ideas makes it visible and gives it a place to talk.

## Design

### Not blocked on #1101

The issue was filed as blocked on the notify templates reaching `theholocron/.github` (#1101). It is not: the `notify` action is in this repo (`ci/actions/notify`), takes the webhook as an input, and a workflow here can call it as `./ci/actions/notify`. The workflow is `.github/workflows/knowledge.specsToIdeas.yml`, one hand-maintained file; nothing else in `.github/workflows` or `ci/` changes, so the generated-files check is unaffected.

### The rules are in the CLI, the workflow only wires

Deciding whether a pull request event on a spec deserves a post, and what the post says, is logic, so it follows the pattern of #929: pure functions in `@theholocron/astromech/repo-validation` (`describeSpecChange`, `specAnnouncementMessage`, reusing `classifySpecPath` and `parseFrontmatter`), and a thin probe, `holocron probe specs announce`, that supplies them with git data and writes the step outputs `post` and `message`. The workflow maps the event to the probe's inputs (`SPEC_EVENT`, `BEFORE_SHA`, `AFTER_SHA`, `PR_NUMBER`, `PR_URL`) and passes the message to the `notify` action.

### What gets a post

Only a spec: `.notes/*.spec.md` and `docs/wiki/specifications/*.spec.md`, the same files `specs check` reads.

| Event                          | A post for                                                               |
| ------------------------------ | ------------------------------------------------------------------------ |
| opened or reopened             | each spec the pull request adds, edits, or changes the `status` of       |
| a push to the pull request     | a spec the push adds, or whose `status` it changes (a typo fix is quiet) |
| merged into the default branch | each spec the pull request landed, with the `status` it landed with      |

The three cases are the three things the issue asks for. A pull request closed without merging, and a merge into a branch that is not the default one (a stacked pull request), post nothing. One event is one post, however many specs it touches: a line per spec, then the pull request.

### The webhook

An `ideas` channel already exists in the layout; it gets `webhook: true`, so `holocron notifications setup` stores its webhook in `HOLOCRON_NOTIFY_WEBHOOK_IDEAS`, like every other channel. With no webhook the workflow warns and posts nothing; the `notify` action skips on an empty one without failing the job.

### Duplicates (#1102)

There is no state to remember that a post was made. A rerun of a run (`run_attempt` above 1) does not post again, at the cost of not retrying a post that failed. The `notify` action never fails the job on a rejected post, so a rerun would not have recovered it either. A pull request that is closed and reopened is announced again, on purpose: it is a new event.

### Safe with a fork

The workflow runs on `pull_request_target`, so a pull request from a fork can reach the webhook secret. That holds only because nothing from the pull request runs: the checkout is the base branch, the CLI and the action are the base branch's, and the pull request's files are read with `git show` as text. The title in a post comes from the file the author wrote, so `specTitle` removes what would format or link in Discord, collapses line breaks and caps the length; the `notify` action already stops any `@` in a message from pinging.

## Out of scope

- Adding `#ideas` to the channels `platform.notifyCheck` proves end to end. Its list is in `ci/workflows`, which this change does not touch.
- Pointing ADRs and specs at a Discord thread (#1535).
