---
id: SPEC-0071
status: draft
issue: theholocron/holocron#1859
blocked-by: []
related:
  - theholocron/holocron#1856
  - theholocron/holocron#1857
  - theholocron/holocron#1744
  - theholocron/holocron#1860
discussion:
  url: https://discord.com/channels/1303969001822486568/1568486490328010862
---

# Provider setup, Linear automation, GitHub board target and one-way issue syncs

## Objective

Make Linear usable beside GitHub while it is trialled, and give provider-specific setup a home that does not turn the
generic commands into vendor code. Four pieces:

1. `holocron provider <name> setup` and `holocron provider <name> doctor`, for what only that provider has.
2. Linear automation (the team's auto-close and auto-archive, and its git automation) declared in config, applied by
   setup and compared by the doctor.
3. `migrate project` into GitHub puts the issues on a Projects v2 board, not only in a milestone.
4. Two separate one-way syncs, GitHub to Linear and Linear to GitHub, that never echo each other's work.

A fifth, smaller change: the repo contract (`AGENTS.md`, `.holocron/org.md`) says "issue and spec" and reads the
tracker from the config's `issues` provider rather than naming GitHub.

## Background

PR #1857 added `@theholocron/linear-client`, `@theholocron/holocron-plugin-linear` and `holocron migrate`. Linear does
not match GitHub feature for feature, and that is accepted: a migration lists what the target could not carry.

Existing commands split cleanly by who owns the vocabulary:

| Command               | Owns                                                                          |
| --------------------- | ----------------------------------------------------------------------------- |
| `project setup`       | board templates: statuses, fields, views, rules (provider-neutral vocabulary) |
| `notifications setup` | channel layout, pinned messages (provider-neutral vocabulary)                 |
| `doctor <capability>` | read-only comparison of the config with what exists                           |

Anything that exists in one vendor only (a Linear team's git automation, a Discord server's roles) has no neutral
vocabulary, so it has no home today. `notifications setup` already carries a little of it (server as code).

## Goals

- Provider-specific setup is a command that names the provider, so the generic command stays generic.
- Everything the provider's API can do is automated; what it cannot is a `todo` that fails the run (the existing rule).
- While trialling Linear, GitHub stays the source of truth and Linear can be thrown away and rebuilt.
- A sync can run on a schedule, repeatedly, and be stopped at any point without a bad state.

## Non-goals

- Two-way sync in one command (conflict and loop rules). Two one-way syncs are the first step.
- Syncing anything but issues: no pull requests, projects/boards, or users.
- Syncing deletions. A deleted issue on the source stays on the target.
- Changing which provider `providers.issues` names.

## Existing behaviour

- `Projects.ensure` on Linear adds the template's statuses to the team, reports fields, views and rules it cannot manage
  as `todos`, and reads (never writes) the auto-archive and auto-close periods.
- `migrate` copies issues, comments and links. A second run skips issues already made (a `holocron:migrated-from` marker
  on GitHub, an attachment on Linear) and never updates one that exists.
- `migrate project` into GitHub puts issues in a milestone named after the board.

## Required behaviour

### 1. `holocron provider <name> setup` / `doctor`

- A new group `provider`, subcommand per provider that registers one. A provider plugin may return a `setup` and a
  `doctor` from `createPlugin` next to `capabilities` and `probes`, as probes are returned today. A provider with
  neither is not listed.
- `provider <name> doctor` is read-only, one row per step, non-zero exit on a failure (the `doctor <capability>` rules,
  and the same shared renderer). `provider <name> setup` writes, supports `--dry-run`, asks first unless `--yes`, treats
  "already right" as success, and reports `ok / fail / skip` counts. Neither prints a token.
- Both read the provider's own block from `holocron.config` (below), never flags only.
- The generic commands do not change. `project setup` keeps templates and statuses; `provider linear setup` does what
  Linear alone has.

### 2. Linear setup and automation

Declared under the provider entry (names only, no secrets):

```ts
providers: {
  issues: ["linear", {
    team: "ENG",
    automation: {
      autoClose: { months: 3, state: "Canceled" },   // team autoClosePeriod / autoCloseState
      autoArchive: { months: 6 },                    // team autoArchivePeriod
      git: [                                         // team git automation
        { event: "start", state: "In Progress" },
        { event: "review", state: "In Review" },
        { event: "merge", state: "Done", branch: "main" },
      ],
    },
    labels: ["bug", "feature", "chore"],             // made on the team when missing
    templates: [                                     // Linear issue templates
      { name: "Bug report", file: ".holocron/linear/bug.md" },
    ],
    project: "Roadmap",                              // made when missing
  }],
}
```

`provider linear setup` makes, in order: the team's missing statuses (from the `projects` template), the labels, the
project, `autoClosePeriod` / `autoArchivePeriod` (`teamUpdate`), and each git automation (`gitAutomationStateCreate`, with
a `gitAutomationTargetBranchCreate` first for a named `branch`). It never deletes or reorders a state, label, project or
automation it does not list. `provider linear doctor` compares each of these with the team and prints one row each.

The `event` values are Linear's own (`draft`, `review`, `start`, `mergeable`, `merge`). A `state` is a team state name and
a name that does not resolve is a failing doctor row, not a silent skip.

### 2b. Labels and issue templates

Linear has both, and a fresh workspace has neither, so setup makes them:

- **Labels** (`issueLabelCreate`): each name in `labels` is made on the team when missing, with the colour of the
  matching GitHub label when `repo.labels`/`CANONICAL_LABELS` has one. An existing label is left alone (colour and
  description are not overwritten). Labels created on demand by `create` and `import` stay as they are today; this makes
  the set exist before the first issue and gives the doctor something to compare.
- **Issue templates** (`templateCreate`, `type: "issue"`, team-scoped): each `{ name, file }` is made from a file in the
  repo whose front matter and body become the template's `title` and `description`, as a pinned Discord message takes its
  text from a file. A template that exists by name is updated only when the file differs, and one setup did not name is
  never touched.

`provider linear doctor` has a row for each label and template: present, and for a template, in step with its file.

### 2a. Automation parity

The automation that moves an issue on its own is part of what a team relies on, so it is declared, applied and checked,
not left as a todo. What each tracker has today, and what the config says about it:

| Event                            | GitHub (Projects v2 workflows, read by `doctor project`)  | Linear (set by `provider linear setup`)                    |
| -------------------------------- | --------------------------------------------------------- | ---------------------------------------------------------- |
| Work starts (branch or draft PR) | not available as a workflow; done by `reconcile-projects` | git automation `start` / `draft` to a state                |
| Pull request ready for review    | not available as a workflow                               | git automation `review` to a state                         |
| Pull request mergeable / merged  | "Pull request merged" workflow                            | git automation `mergeable` / `merge` to a state            |
| Issue closed                     | "Item closed" workflow                                    | closing moves it to a completed state; auto-close settings |
| Stale issue                      | none                                                      | `autoClosePeriod` and `autoCloseState`                     |
| Closed issue archived            | "Auto-archive items" workflow                             | `autoArchivePeriod`                                        |

Required: the `rules` of a board template stay the provider-neutral names (`BoardRule`); `provider linear setup` maps each
to the Linear setting above and writes it, and `provider linear doctor` and `doctor project` both report a rule that is
off or has no Linear equivalent, so a gap in automation is visible before a migration, not after. GitHub's workflows
cannot be created from the API (existing behaviour, reported as a `todo`); that asymmetry is listed in the Linear plugin
page and in the `not carried across` output when a board is migrated.

### 3. A GitHub board as a migration target

Tracked separately as #1860.

`migrate project <name> --to github` finds or makes the board with `projects` (template `roadmap` unless `--template`),
adds each migrated issue (`addProjectV2ItemById`, `contentId` the issue's `node_id`), then sets Status from the record's
status or category and Priority from the record's priority (the existing single-select update path, which never clears a
value). A status or priority with no matching option is reported in `dropped`, not created.

The milestone is still set when `--milestone` is given, and is no longer implied by the board name.

### 4. Two one-way syncs

`holocron sync issues --from <a> --to <b>` is one direction. GitHub to Linear and Linear to GitHub are the same command
with the ends swapped, run separately and configured separately. Unlike `migrate`, it updates what it made.

For each issue on the source it finds the issue it made on the target (by the recorded source address) and:

- creates it when missing (as `migrate` does);
- updates title, description, state, priority, labels and assignee when they differ from the source;
- adds comments the target does not have, oldest first; it never edits or deletes a comment.

It writes nothing to the source, ever. A target issue is changed only when it was made by a sync or a migrate, which it
knows from the recorded address.

**Loop guard.** A sync skips any source issue that itself carries a recorded address from the other tracker. An issue
copied GitHub to Linear has a `migrated-from` attachment pointing at GitHub; the Linear to GitHub sync therefore skips
it, and the reverse. The guard is checked on the source, before any write.

`--since <time>` narrows the read; `--dry-run` prints creates, updates and what is not carried; `--yes` skips the
question (a scheduled run needs it). The report ends with the same `not carried across` list as `migrate`.

### 5. Repo contract

`AGENTS.md` and `.holocron/org.md` read: file an issue and write a spec first, in the tracker the config's `issues`
provider names, and reference it from commits and the PR in that tracker's syntax. GitHub remains the default when no
`issues` provider is set.

## Interfaces

- `Plugin` gains optional `setup?(ctx)` and `doctor?(ctx)`, each returning rows in the shape `printCheckRows` takes.
- `Issues` gains optional `sync?(records, options)` (returns the `ImportResult` shape plus `updated: boolean`); `import`
  is `sync` with updates off. A provider without it cannot be a sync target.
- `Projects` gains an optional `addItems?(board, keys)` used by `migrate project` (GitHub implements it).
- New `COMMAND_CONTEXTS` and `COMMAND_REGISTRY` entries for `provider <name> setup|doctor` and `sync issues`
  (`workspace`).

## Data model

No new stored state. The recorded source address (marker or attachment) is the only link between an issue and its copy.
Updating relies on reading it back, so a target issue whose marker was edited out is treated as unknown and is created
again.

## Validation

- `provider linear` config: `team` required; `automation.*.months` a non-negative integer; `git[].event` one of Linear's
  five; every `state` and `branch` a non-empty string. Wrong shape is a `ConfigError` naming the path.
- `sync issues`: `--from` and `--to` differ (as `migrate` already checks); the target must implement `sync`.

## State transitions

An issue's state is mapped by name, then category, as `migrate` does. A sync moving a Linear issue to a completed state
closes the GitHub copy; reopening on either side reopens the copy (one direction each, no echo, by the guard).

## Error handling

- A failed step does not abort `provider ... setup` (soft-skip rule).
- A failure part-way through a sync leaves every finished issue correct; the next run continues. A rate limit stops the
  run cleanly with a `left` count, as `specs sync` does.
- Never repeat a write. A failed create is not retried inside the run.

## Authorization and security

- Linear writes need a key with write access to the team and admin for team settings. A read-only key makes the
  settings rows `todo`, not a crash.
- No tokens in config, output or logs. Names only.
- A sync target must be one the user named; a scheduled sync's tokens come from the same credential chain as the CLI.

## Observability

Rows through the shared renderer; the sync report counts created, updated, unchanged, skipped (guard) and left.

## Compatibility

All changes are additive. `migrate` is unchanged apart from `migrate project --to github` adding board items when a
`projects` provider is available there; without one it keeps the milestone behaviour.

## Edge cases

- Two syncs running at once on the same pair: the second finds the issue the first made through the recorded address;
  a create race can still produce a duplicate. A lock is out of scope; schedule them apart.
- An issue moved between teams on Linear is treated as new on the next run.
- A comment edited on the source after it was copied is not re-copied.
- Source issue deleted: the copy stays.

## Testing requirements

Fakes for both providers, as in the `migrate` tests. Cover: each setup step creating and being a no-op the second time;
a doctor row per declared setting; the loop guard in both directions; update vs create vs unchanged; comment append-only;
a GitHub board target with a missing option; a rate limit mid-run.

## Acceptance criteria

- `holocron provider linear setup --dry-run` against a fresh team lists every step; running it twice changes nothing the
  second time; `provider linear doctor` is clean afterwards.
- Run GitHub to Linear then Linear to GitHub on the same pair: no issue is created in either tracker by the second run.
- Closing a GitHub issue and re-running GitHub to Linear closes the Linear copy.
- `migrate project <name> --to github` leaves the issues on the board with Status and Priority set.

## Unresolved design questions

1. **Command name for the group.** `provider <name> setup` vs `<name> setup` (`holocron linear setup`). The first keeps
   names out of the top level but adds a word; the plugin-returned `setup` makes it automatic either way.
   _First PR: `provider <name> setup|doctor`, as the spec's default. The provider names come from the loaded plugins, so
   the command is `provider [name] [action]` (like `probe`), not a yargs subcommand per provider._
2. **Where `sync` lives.** `sync issues` collides in spirit with the existing `sync github` / `sync wiki` group
   (publishing generated files). `migrate --update` is the alternative, at the cost of `migrate` no longer being
   create-only.
   _Decided: `sync issues`, as the spec's command, beside `sync github`; `migrate` stays create-only._
3. **Assignees across trackers.** Matched by email today. A per-org mapping file (like the Discord links file) would let
   a sync keep assignees; not decided.
   _Sync keeps email matching: a Linear target matches the source assignee by email and never clears one; a GitHub
   target cannot map a Linear user to a login, so it keeps no assignee and reports `assignee (not mapped)`._
4. **Scheduling.** A reusable workflow plus a thin caller (as `reconcile-projects`), or only a local command for the trial.
   _Not built: `sync issues` is a local command with `--yes` for a scheduled run; the workflow is a follow-up._
5. **GitHub priority.** Priority is a `priority: <level>` label on GitHub issues today. A sync to a board target would set
   the Priority field instead; whether to also keep the label is open.
   _Sync keeps today's `priority: <level>` label on GitHub; the board field belongs to #1860._
6. **Whether Linear's git automation can be read back reliably** (target branch regex vs pattern) for the doctor to
   compare; needs checking against the live schema before this spec is accepted.
   _Resolved against `linear/linear` `packages/sdk/src/schema.graphql`: the git rules can be read back reliably. A rule
   is `GitAutomationState { event, state, targetBranch }` and its target branch `GitAutomationTargetBranch
{ branchPattern, isRegex }` (the rule's own `branchPattern` is deprecated). `provider linear setup` and `doctor`
   match a rule by event and exact branch (`isRegex: false`) and compare its state; `branch` in the config is a literal
   name, and a regular-expression target never matches it. A target branch with no rule cannot be listed (no query for
   it), so making a rule for it fails the row until one exists._

7. **Where the template text comes from.** A dedicated `.holocron/linear/*.md` file (above), or reuse GitHub's
   `.github/ISSUE_TEMPLATE/*.md` so one set of templates serves both trackers while both run. The second avoids drift
   but ties Linear's templates to GitHub's front-matter format.

   _Decided: `.holocron/linear/*.md`, as in section 2b. The declaration (`templates: [{ name, file }]`) is validated.
   Templates are not applied or compared: the schema gives `templateData` only as "a JSON-encoded string containing
   the pre-filled attributes" with no issue shape, `TemplateCreateInput` has no markdown field, and `Template.content`
   is read-only, so a template cannot be written or read back with certainty. Each run reports a skipped row, and the
   template is made in Settings → Templates. Revisit when Linear documents the issue `templateData`._

## Implementation notes

First PR (draft, on the Linear plugin's branch): the `provider` command and the plugin-returned `setup` / `doctor`
(`ProviderAction`, `PluginLoader.providerActions()`), and Linear's labels, project, `autoClosePeriod` /
`autoCloseState` / `autoArchivePeriod`, with the config validation above. Not in it: the team's statuses (still
`project setup`), the `rules` to Linear mapping (the declared `automation` block writes the settings; `doctor project`
already reports a rule that is off), sections 3 to 5. Second PR (`feat/linear-git-automation-templates`): the git rules (applied and compared) and the `templates` declaration (validated, reported as skipped).

Section 3 (#1860): `Projects.addItems?(owner, board, items, template)` takes `BoardItemInput`s (key, status, category, priority) rather than bare keys, because Status and Priority are set in the same call; it returns an `AddedItem` per input (`added`, `dropped`). `migrate project` uses it when the target's `projects` provider has it, and the milestone is then set only by `--milestone`. Built: GitHub's `addItems`, `--template`, the board line and the `dropped` counts. Not done: the built-in `roadmap` template's priority options (`1 · Now`...) do not match the neutral levels, so a board made from it drops every priority until a template names `urgent` to `P3` options (an open choice, not decided here).

Sync PR: `sync issues` (`commands/sync-issues/`) and the optional `Issues.sync` with the GitHub and Linear
implementations. `IssueRecord.migratedFrom` carries the recorded address for the loop guard and `IssueSelector.since`
narrows the read. `sync` returns the records it finished; a rate limit makes that list shorter and the command counts the
rest as `left`. A comment is found on the target by its time (and, on Linear, also by its text), so one edited on the
source is not copied twice. Not in it: scheduling (question 4), a mapping file for assignees (question 3), moving
`import` onto `sync` (`import` keeps its own loop beside the shared create function), and the parent and blocked-by links
of an issue made by a sync that was stopped by a rate limit before the link pass.

## Related

- #1856, #1857: Linear plugin and `migrate`.
- #1744: `projects` capability (SPEC-0020).
