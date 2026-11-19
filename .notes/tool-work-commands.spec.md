---
id: SPEC-0102
status: draft
issue: theholocron/holocron#2429
blocked-by: []
related:
  - theholocron/holocron#1859
  - theholocron/holocron#2253
  - theholocron/holocron#2388
  - theholocron/holocron#1994
discussion:
  url: https://discord.com/channels/1303969001822486568/1573051454606938224
---

# Work commands: the life of one piece of work

## Problem

One piece of work passes through the same steps every time: an issue with its fields, a spec when it needs one, a branch, a first commit, a draft pull request, board statuses, a green aggregate, a merge and a clean-up. Today each step is hand work with `gh`, `git` and a tracker's own page.

- `new issue` (`cli/cli/src/commands/issue-create/`) takes a title, body, labels, assignees and a milestone. `update` has only `update skills`; there is no `update issue`.
- `Issues.create()` has no field beyond those. `IssueRecord` already carries parent, blocked-by, labels, milestone, assignee and priority, but only `export`, `import` and `sync` use them, and the GitHub import does not set parent or blocked-by links (`issues-migration.ts`).
- The org's issue fields (Priority, Start date, Target date, Effort) and issue Types (Bug, Feature, Task) are set by nothing, except Priority, which `createPrioritySetter()` writes during `sync issues` (#2253).
- `Source` can read pull requests (`getPullRequest`, `listPullRequests`, `listPullRequestCommits`) and delete a branch, but cannot create one, mark it ready or update it. `@theholocron/github-client`'s `pulls` group has no create, update or ready call.
- The board's statuses follow the pull request (#2388): In Progress from an open linked pull request, In Review from a green `ci / Required checks`, Blocked from a blocked-by link, Done from the issue closing. An agent starting work today runs `holocron project status <issue> "In Progress"` (`.holocron/org.md`) by hand.

## Goals and non-goals

Goals: one command per moment in the life of the work, each previewable with `--dry-run`, each asking before an outward write, each safe to run twice. Issue-side behaviour goes through the provider-neutral `issues` capability so it works with Linear.

Non-goals: the CLI never calls a model (effort and the pull request title are inputs, chosen by a person or passed by an agent or skill as flags); no merge by the CLI unless Q5 says so; no change to how the board's status rules work; no change to `sync specs`.

## Decisions already made

- **Verbs** (the CLI is verb-first): `new work`, `start work`, `update work`, `close work` (with `--abandon`). `new issue` and `update issue` stay separate commands that edit only the tracker's issue, with every field. `update work` spans the issue, the pull request and the board and is not an alias of `update issue`. `start work` is its own verb; `update work --start` may be an alias of it.
- **Spec files stay.** They are the design record; the issue is the tracking record. A small issue can use its body as the spec.
- **The pull request side is GitHub only.** The issue side is provider-neutral; on Linear the pull request links back with the key (`Closes ENG-42`).

## Commands

Every command is a `workspace` command (`assertPluginsResolvable`), needs a `COMMAND_CONTEXTS` and a `COMMAND_REGISTRY` entry, and a menu decision for each option (`command-options.test.ts`). Flags below are proposals. "Writes" names the service, so the outward-facing steps can be seen.

### `new issue` and `update issue` (tracker only)

`new issue <title>` gains: `--type bug|feature|task`, `--priority urgent|high|medium|low`, `--effort high|medium|low`, `--start-date`, `--target-date`, `--parent <key>`, `--blocked-by <key>` (repeatable), `--project <board>`, and keeps `--body`, `--body-file`, `--label`, `--assignee`, `--milestone`, `--yes`.

`update issue <key>` takes the same field flags to set them, plus `--title`, `--add-label` / `--remove-label`, `--unblock <key>`, `--clear <field>` and `--state open|closed`. A field not named is left alone; nothing is cleared unless asked.

| Step                                       | Writes to                               |
| ------------------------------------------ | --------------------------------------- |
| create or edit the issue, labels, assignee | tracker (`issues`)                      |
| Type, Priority, Effort, Start/Target date  | tracker (`issues`, GitHub issue fields) |
| parent, blocked-by                         | tracker (`issues`)                      |
| add to a board, set board fields           | tracker (`projects`)                    |

Safeguards: asks before writing unless `--yes` (no terminal and no `--yes` is `NonInteractiveError`); `--dry-run` prints the fields that would be set and the ones the provider will drop, and calls no write.

### `new work <title>`

`new issue` plus the optional spec. Extra flags: `--spec [name]` (scaffolds through the existing `new spec <issue>`, `commands/ideas-promote/`), `--effort` (asked on a terminal when absent; an agent or skill passes it), `--assignee` (default: the current user, Q4). The spec is written to the working tree only; `new work` makes no branch and no commit (that is `start work`'s first commit).

| Step                         | Writes to          |
| ---------------------------- | ------------------ |
| the issue and all its fields | tracker            |
| the spec file                | local working tree |

### `start work <issue>`

Flags: `--name <slug>`, `--title <pull request title>`, `--base alpha`, `--worktree [path]` / `--no-worktree`, `--spec <path>`, `--phases <names>`, `--no-pr`, `--yes`, `--dry-run`.

Steps, in order, each a row through `printCheckRows`:

1. Read the issue (`Issues.get`) and its Type, parent and blockers.
2. Set the issue's start date (today) and Effort when they are empty (tracker write).
3. `git fetch origin <base>`, then make the branch and, by default, a worktree from `origin/<base>` (local).
4. Make the first commit with `-s`:
   - **work has a spec:** the spec file (`status: draft`), so if the work never starts the pull request is only a spec pull request and can merge as one;
   - **no spec:** `--allow-empty`, subject a Conventional Commit (type from the issue Type: Bug `fix`, Feature `feat`, Task `chore`, no Type `chore`; scope guessed from the issue's labels or the paths it names), the same text as the intended pull request title; the body links the issue and the spec.
5. Push the branch (remote write). Hooks run; `--no-verify` is the person's choice, not a default.
6. Open a draft pull request linked to the issue (`Refs` or `Closes`), body from a short template (spec link, a list of phases), and copy the issue's fields to the pull request where GitHub has them (labels, assignees, milestone, project). Type, Priority and the date fields exist only on issues, so they are not copied (remote write).

The board status is not set: the open linked pull request moves it to In Progress (Sentinel's board-status handler, the hourly `reconcile-projects`). The last row says so and names `update work --status` for when the automation is down.

| Step                     | Writes to         |
| ------------------------ | ----------------- |
| start date, Effort       | tracker           |
| branch, worktree, commit | local git         |
| push, draft pull request | GitHub (`source`) |

**The pull request title.** semantic-release reads the squashed title, so the first guess matters; `update work --title` changes it. `start work` prints the title it chose and what the type means for a release (a `feat` or `fix` to `alpha` publishes a prerelease).

**GitHub cannot open a pull request with no commits beyond the base.** That is why the first commit exists. Not verified against the live API (see "Not verified"); it is the documented behaviour (the create call answers 422).

### `update work <issue>`

Flags: every `update issue` field flag, `--title` (the pull request's; `--issue-title` for the issue's), `--blocked-by`, `--unblock`, `--label`, `--start` (alias of `start work`), `--status <status>` (manual override), `--dry-run`, `--yes`.

- Issue fields go through `Issues.update` (new). The pull request's title and body go through a new `Source.updatePullRequest`. The board goes through `Projects.setStatus` only.
- **`--status`** is the manual path (`holocron project status` exists). It is temporary: the rules overwrite it once the automation is back (#2388, `planReconcile()` then `planPullRequestStatus()`). The command prints that after every use. What it accepts is Q6.
- Blocked comes from a blocked-by link: `--blocked-by` writes the link and the rule sets the status.

### `close work <issue>`

Flags: `--wait`, `--timeout`, `--abandon`, `--keep-worktree`, `--yes`, `--dry-run`.

1. Find the pull request from the issue (a closing reference, or the branch) and read the `ci / Required checks` aggregate; with `--wait` poll until it completes or the timeout passes. Not green stops here and names the failing checks.
2. Green: mark ready (the `gh pr ready` equivalent, a new `Source.markReady`) after asking. The board moves to In Review by itself.
3. Update the issue's relations (a closed blocker unblocks).
4. After the merge (the command is run again): remove the worktree and the local branch (local) and check the remote branch is gone. GitHub's automation deletes it; the command only checks and reports a row. Done is set by the rules when the issue closes.

`close work --abandon` always asks first (`--yes` allowed). It closes the pull request, withdraws the spec's discussion post (`sync specs --withdraw --files <spec>`, which tags it `withdrawn` and closes it), removes the worktree and local branch, and asks whether to close the issue as not planned. It says so, and stops, when the branch holds unpushed commits.

| Step                                 | Writes to         |
| ------------------------------------ | ----------------- |
| mark ready, close the pull request   | GitHub (`source`) |
| issue relations, close the issue     | tracker           |
| withdraw the spec's post             | Discord           |
| remove worktree, delete local branch | local git         |

## The tension: one pull request carrying the spec

Today the process is Issue, Spec, pull request, merge, and one pull request is one focused change (`.holocron/org.md`). A spec pull request merges first; the implementation is another pull request. A first commit that is the spec, in the pull request that later carries the implementation, changes that:

- The spec merges with the code, not before it. A spec on `alpha` as `draft` for review before any code is written (the point of `preview-specs`, the forum post and a gatekeeper's `accepted`) is now reviewed inside a pull request that may already hold code.
- `.notes/` holds only in-progress specs; a settled one moves to `docs/wiki/specifications/`. Moving it in the same pull request makes the diff larger, and the move is invisible in review unless one commit does only the move.
- The aggregate and Codecov run on every push, so a pull request that begins as one spec file runs the whole CI.
- One pull request, one squashed commit: the title will be `feat(...)`, so the spec's own history disappears into the squash, and the abandoned-after-spec path merges under a title (`docs(specs)`) that `start work` did not guess.

Options:

1. **Two pull requests (today).** `start work` makes the spec pull request first (first commit is the spec, title `docs(specs): ...`); a second `start work` makes the implementation branch off `alpha` after the spec merges. Keeps the rule and the gatekeepers' review of the spec; two starts.
2. **One pull request, spec first.** As proposed in conversation. The first commit is the spec; later commits move it to `accepted` and add the code; the title is rewritten with `update work --title` before the merge. Fewer pull requests; breaks one focused change and the review order.
3. **One pull request only for work with no separate spec** (small work). The first commit is the empty one; a spec, when needed, is its own pull request (option 1).

Recommendation: default to option 1 when the work has a spec and option 3 when it does not, and offer option 2 as an opt-in (`start work --one-pr`) until the maintainer decides (Q1). This keeps the rule and the spec review, and still gives the one-pull-request flow where it is wanted.

## Capabilities and interfaces

All new methods are optional, like `export`, `import` and `sync`, so a provider without them gives a clear "not supported by <provider>" row, never a crash.

- `Issues.update?(key, patch: IssuePatch): Promise<IssueUpdateResult>`. `IssuePatch`: title, body, state, labels to add or remove, assignees, milestone, priority, effort, kind, start date, target date, parent, blocked-by to add or remove. `IssueUpdateResult` has `dropped?: string[]` like `create`. `transition` stays.
- `Issues.create` gains the same fields (a wider input, not a new method), and returns `dropped`.
- New neutral types in `capabilities.type.ts`: `IssueEffort` (`high | medium | low`) and `IssueKind` (`bug | feature | task`). `IssueRecord` could gain the same optional fields so `export` and `sync` carry them later (Q9).
- `Source.createPullRequest?`, `Source.updatePullRequest?` (title, body, draft) and `Source.markReady?`. The link is the body's `Refs` or `Closes` line (GitHub's own closing reference does it), so there is no separate link call. `@theholocron/github-client`'s `pulls` group gains create, update and the GraphQL `markPullRequestReadyForReview`.
- `Projects.setStatus` is unchanged.
- GitHub: `plugins/holocron-plugin-github/src/capabilities/issues-update.ts` over `githubClient.issueFields` (Priority's pattern: list once, add with `POST`, replace by `DELETE` then `POST`, never `PUT`), the issue's Type through the issues API, parent and blocked-by through GraphQL (the node ids `issues-migration.ts` already reads).
- Linear: `clients/linear-client` carries `estimate` and `dueDate` on an issue; the plugin's `issues` and `projects` already map status and priority.

### What each provider can do today

| Field                                | GitHub                                                              | Linear                                                                                           |
| ------------------------------------ | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| title, body, labels, assignee, state | yes (`updateIssue`, label calls)                                    | yes                                                                                              |
| milestone                            | yes                                                                 | the project (`IssueRecord.milestone`)                                                            |
| priority                             | label today; issue field through `createPrioritySetter()` (#2253)   | built-in priority                                                                                |
| Effort                               | org issue field Effort; same API as Priority, not yet written       | `estimate`, a per-team scale that may be off: a team without it drops the value with a row       |
| Type                                 | issue Type (Bug, Feature, Task), issues only; no code sets it today | none; the kind is a label                                                                        |
| start date                           | org issue field Start date, not yet written                         | not in the client's types (`dueDate` only); not verified that Linear has none                    |
| target date                          | org issue field Target date, not yet written                        | `dueDate`                                                                                        |
| parent, blocked-by                   | read through GraphQL; not written by `import` today                 | read and written by `import` (two passes)                                                        |
| board status                         | by the rules (#2388)                                                | the team's workflow state; git rules not applied or compared yet (SPEC-0071 open questions 6, 7) |

## Idempotency, failure and partial states

The issue, not a local file, is the record of what is done. Each step probes first and treats "already done" as success:

- **Run twice:** start date and Effort are set only when empty; an existing branch is reused when it has the expected first commit and refused otherwise; the first commit is not made twice (the branch's log is read); the pull request is found by head branch and reused.
- **Issue made, branch not** (a crash after `new work`, or `start work` failing at step 3): the issue is the anchor, and `start work <issue>` resumes at the first undone step. `new work` prints the issue key before it does anything else.
- **Branch made, commit or push failed:** the next run finds the local branch and carries on at the commit. Nothing is deleted on a failure; the command says what exists and what the next run does.
- **Pushed, pull request not made:** the next run finds the pushed branch and opens only the pull request.
- **A tracker field refused** (a missing option, a plan with no estimate): a `dropped` row, not a failure; a rate limit stops the run cleanly and names the step left.
- **`close work`:** each step is independent and re-runnable; the aggregate is read each time, so "ready" is never assumed.

Outward actions ask first (`--yes` skips; no terminal and no `--yes` is `NonInteractiveError`). `--dry-run` runs every read, prints each row as `would ...`, and writes nothing, local git included. Tests and agents use fakes only and never read real 1Password Environments or GitHub secrets; a live run is the maintainer's.

## Rollout

One pull request per focused change, in this order, each with tests and docs:

1. `Issues.create` and `Issues.update` with every field, the GitHub and Linear implementations, `new issue` flags and `update issue`.
2. `Source` pull request methods and the github-client calls (create, update, mark ready).
3. `start work` (with the first-commit and branch helpers).
4. `new work`.
5. `update work` (`--status` last, a wrapper over `project status`).
6. `close work`, then `--abandon`.
7. Agent instructions for the finished set, if not already done with each step.

## Docs and agent instructions

- `.holocron/org.md`, "Keeping the project board true": replace the by-hand `holocron project status <issue> "In Progress"` with `start work`, and name `update work --status` as the temporary override. `org.md` is embedded and synced to every repo, so this lands with the `start work` pull request, not before.
- `AGENTS.md`: a bullet for the work commands, the new optional methods and the first-commit rule.
- `cli/cli/README.md` and the docs site: each command, its flags and the table of what writes where.
- Interactive menu: a `COMMAND_REGISTRY` and `COMMAND_CONTEXTS` entry per command, and each option offered or skipped in `command-options.test.ts`; none is `secret`.
- A skill, or a section of an existing one, telling an agent how to choose `--effort` (the CLI never calls a model).

## Open questions

1. **One pull request or two** for work that has a spec (the tension above). Recommendation: two by default, `--one-pr` opt-in.
2. **The phase template** in the pull request body: names and count (for example Design, Build, Docs, Verify), and whether it is a task list.
3. **Branch naming**: `<type>/<issue>-<slug>` (`feat/2429-work-commands`), the number first, or the Linear key.
4. **Default assignee:** the token's user (`getMyself()`), which is the bot under an agent's token. Should an agent's run assign the person, or nobody?
5. **Does `close work` merge** or only mark ready? Merging cannot be undone and the maintainer merges today. Recommendation: only mark ready.
6. **What `--status` accepts:** any status, or only those the rules do not own (Backlog, Planned, In Progress)? Recommendation: refuse In Review, Blocked and Done unless `--force`.
7. **Worktree location:** `.claude/worktrees/<slug>` (where agents work today), a sibling directory, or a config key. `--no-worktree` only branches.
8. **Linear start date:** does an issue have one? The client has `dueDate` only. If not, `start work` drops it with a row, or writes it as a label or a comment.
9. **Carrying the new fields through `export`, `import` and `sync`** (so `sync issues` copies effort and type): in or out of this spec?
10. **Issue with no Type:** `chore` plus a note, or ask. And `Closes` or `Refs` by default in the pull request body (work that does not fully close the issue)?

## Not verified

- That GitHub refuses a pull request with no commits beyond the base: stated from documented behaviour; no live request was made.
- That Effort, Start date and Target date can be written through the REST issue-fields API the way Priority is. They are assumed to follow the Priority pattern (`issueFields.addValues`), not tried. Setting an issue Type through the API was not checked.
- That GitHub's API can set an issue's parent and blocked-by links. The plugin reads them through GraphQL; the write mutations were not checked.
- That Linear has no start date on an issue, and how a team with estimates off answers an estimate write.
- That the board-status handler runs on the instance a person uses (production is down, #1100, per AGENTS.md), so In Progress by the rule may lag; this is why `--status` exists.
- That `markPullRequestReadyForReview` works with the token scopes the CLI holds.
- That GitHub deletes the head branch after a merge in this repo (a repo setting); the command only checks.
