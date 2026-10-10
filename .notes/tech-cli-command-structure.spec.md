---
status: draft
issue: theholocron/holocron#975
blocked-by: []
related:
  - theholocron/holocron#576
  - theholocron/holocron#438
---

# CLI command structure: regroup by noun, full interactive-menu coverage

## Context

Commands were added one at a time, so the surface is a flat mix of verbs
(`setup`, `publish`, `cleanup-preview`, `sync-readme`, `sync-github`,
`deploy-on-release`, `bump-versions`) and a few groups (`auth`, `skills`,
`upgrade`, `secrets`). `secret set` and `secrets sync` even disagree on
singular/plural. `COMMAND_REGISTRY` (the interactive menu, spec
`tool-interactive-cli-menu`) is hand-maintained and covers only part of it.

## Decisions

- **Hard break.** Old names are removed, with no deprecated aliases (we're on
  the `alpha` channel; maintainer's call). Consequence: anything that shells
  out to an old name must change in the same PR — see _Blast radius_.
- **`deploy [branch]` stays** as the `deploy` group's default command next to
  `deploy cleanup-preview` and `deploy on-release`.
- **`lint commit-msg <file>` becomes `run lint commit-msg <file>`** — a job of
  the `lint` task, consistent with `run <task> [job]`.

## Target surface

| Before                                                                | After                                 |
| --------------------------------------------------------------------- | ------------------------------------- |
| `doctor`                                                              | `doctor`                              |
| `ci`                                                                  | `run ci`                              |
| `lint`                                                                | `run lint`                            |
| `lint commit-msg <file>`                                              | `run lint commit-msg <file>`          |
| `new [type] [name]`                                                   | `new repo [type] [name]`              |
| `plugin create [slug] [vendor]`                                       | `new plugin [slug] [vendor]`          |
| `setup`                                                               | `repo setup`                          |
| `upgrade node [to]`                                                   | `repo upgrade node [to]`              |
| `upgrade deps`                                                        | `repo upgrade deps`                   |
| `sync [steps..]`                                                      | `repo sync [steps..]`                 |
| `sync-readme`                                                         | `repo sync readme`                    |
| `sync-github`                                                         | `sync github`                         |
| `secrets sync [environmentId]`                                        | `secrets sync [environmentId]`        |
| `secret set [name] [value]`                                           | `secrets set [name] [value]`          |
| `cleanup-preview [pr]`                                                | `deploy cleanup-preview [pr]`         |
| `deploy-on-release`                                                   | `deploy on-release`                   |
| `deploy [branch]`                                                     | `deploy [branch]`                     |
| `bump-versions [new-version]`                                         | `package bump-versions [new-version]` |
| `publish`                                                             | `package publish`                     |
| `clone [target]`, `run <task> …`, `config show`, `skills …`, `auth …` | unchanged                             |

`repo sync [steps..]` and `sync github` share the word `sync` on purpose:
`repo sync` is the in-repo sync (properties, scripts, workflows, README);
`sync github` pushes generated files to the org's `.github` repos.

## Design

### `run` absorbs `ci` and `lint commit-msg`

`ci` is not a manifest task, so the `run` handler special-cases the task name
`ci` and routes to `astromech.ci()`, keeping `--all` and `--filter`. It must be
documented in `holocron run --help`. `run lint commit-msg <file>`: `commit-msg`
is the job and the file arrives as the first passthrough arg; the handler
dispatches to the existing commit-message linter instead of astromech's
filesystem-driven `lint` task. Neither takes the interactive prompt (they stay
out of the menu, as `run` is today).

### yargs

Nested `.command()` groups like `auth` / `skills` today. A group with no
default handler prints its subcommands (yargs `demandCommand`). `deploy` is the
exception: it keeps `deploy [branch]` as its default via a `$0`-style default
command, so `deploy`, `deploy <branch>` and `deploy cleanup-preview` all parse.

### Execution contexts

`COMMAND_CONTEXTS` keys are the full command names, so every key is renamed to
match (`repo setup`, `deploy cleanup-preview`, `package publish`, …);
`contexts.test.ts` already fails when a command lacks an entry, so it guards
the rename.

### Interactive menu

Every command except the CI/hook-only ones (`run <task>`, `run lint commit-msg`)
gets a `COMMAND_REGISTRY` entry; `run ci` is kept as a concrete, prompt-free
entry. Commands with a required positional prompt for it as today. New
`group` values (`repo`, `package`, `deploy`, `new`, `sync`, `secrets`) feed the
Layer-2 grouping. A test asserts the registry is complete against the
registered yargs commands (minus the explicit exclusions) so it can't drift
again.

## Blast radius

- `packages/cli/src/cli.ts`, `commands/contexts.ts`, `interactive-menu.ts` and
  their tests.
- `.husky/commit-msg` (`lint commit-msg` → `run lint commit-msg`) and
  `.husky/pre-push` (`ci` → `run ci`).
- `packages/astromech`: generated thin callers, reusable workflow templates,
  the `holocron` composite action, `tasks/ci.ts`, and any registry text that
  names an old command; regenerate and let `holocron sync-github` push.
- `packages/sentinel`, `packages/cli/src/{commands,config,utils}` strings that
  print old command names in messages/hints.
- Docs: `packages/cli/README.md`, `AGENTS.md`, root `README.md`,
  `docs/src/content/docs/**` (commands pages, config, tokens), ADR-0009
  references.
- Downstream repos synced from older templates keep calling old names until
  they re-sync, since there are no aliases. Release notes must say so.

## Release

No `!` and no `BREAKING CHANGE:` footer on any of these commits: the project is
on the `alpha` channel, so the rename stays within v5 (maintainer's call).
Downstream repos on older synced templates keep calling the old names until
they re-sync; the release notes should say so.

## Rollout

1. Spec (this PR).
2. `run` absorbs `ci` / `lint commit-msg`; husky hooks, templates and every
   reference to the old names updated in the same PR (theholocron/holocron#977).
3. Regroup the rest + `COMMAND_CONTEXTS` + menu completeness test, with the
   reference sweep (workflow templates, `command:` inputs, release config, docs).
4. Anything the sweep left behind, plus verifying `holocron sync github`
   regenerates a clean tree.

## Out of scope

- Deprecated aliases (explicitly decided against).
- New commands; this only moves and groups existing ones.

## Open questions

- Should `package` also grow `package version`/`package pack` later, or stay
  `bump-versions` and `publish`?

## Implementation notes

- `deploy` keeps `--project-id` but no longer `demandOption`s it: yargs makes
  nested subcommands inherit a parent's required options, so `deploy on-release`
  would have demanded it. The default handler enforces it instead.
- `repo sync readme` is a real subcommand (still no plugins, `repo-aware`), not
  the `readme` step of `repo sync [steps..]`; `repo sync labels readme` still
  runs the step.
- The `holocron` composite action word-splits `command`, so multi-word values
  (`repo sync`, `deploy on-release`) become separate arguments.
- `# managed by holocron setup — …` lines in `.gitignore` are block markers, not
  command references; they are unchanged so existing blocks are still found.
