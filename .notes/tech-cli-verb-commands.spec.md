---
status: draft
issue: theholocron/holocron#2082
blocked-by: []
related:
  - theholocron/holocron#975
  - theholocron/holocron#576
  - theholocron/holocron#438
---

# CLI commands are verbs: the object follows the verb

## Problem

SPEC-0040 (#975) regrouped the CLI by noun. The result is a tree where a group name says what the commands are about
and not what they do, and where one word means different things in different places:

- `notifications` notifies no one: it sets a server up, links an account, makes a channel, syncs roles, deletes
  duplicate posts.
- `package bump-versions`, `package publish` and `package move-tag` are one release flow under a noun.
- `sync` exists twice (`repo sync` and `sync github`), `setup` three times (`repo setup`, `project setup`,
  `notifications setup`), and `list` is spread over `secrets list`, `project list` and `auth list`.
- A person who knows the verb has to guess the noun, and the other way round.

## Decision

Every command is a verb, and the object follows it. This is how `new repo`, `sync github`, `migrate issues`,
`deploy stage` and `doctor <target>` already read.

- **Hard break.** Old names are removed, with no deprecated aliases (as in SPEC-0040; the project is on the `alpha`
  channel). Anything that shells out to an old name changes in the same PR.
- **Exceptions that stay as they are:** `doctor` (its subcommands are targets), `probe` (its first argument is a
  provider and the probe names come from plugins) and `provider [name] [action]`.
- **Singular or plural.** The object is singular when the command acts on a named thing (`new secret`, `remove token`,
  `remove skill`, `check token`, `close project`) and plural when it acts on a collection (`list secrets`,
  `sync secrets`, `export tokens`, `install skills`, `update skills`, `move issues`).
- **One verb, one meaning.** A verb that was spread across groups becomes one command with the object as its
  subcommand (`sync`, `setup`, `list`, `new`, `remove`, `check`).
- **`close` is not `remove`.** `project close` is reversible (the provider can reopen the board), so it stays `close`.

## Target surface

Alphabetical by top-level verb. Rows marked `=` keep their name.

| New command                                                                      | Replaces                                                 | Context    |
| -------------------------------------------------------------------------------- | -------------------------------------------------------- | ---------- |
| `apply properties`                                                               | `repo properties apply`                                  | workspace  |
| `check monitor <url>`                                                            | `monitoring check <url>`                                 | workspace  |
| `check resolved <url>`                                                           | `monitoring run-resolved <url>`                          | global     |
| `check token [provider]`                                                         | `auth check [provider]`                                  | global     |
| `cleanup branches`                                                               | `repo cleanup branches`                                  | workspace  |
| `cleanup posts [channel] [--provider]`                                           | `notifications dedupe [channel]`                         | workspace  |
| `clone [target]`                                                                 | =                                                        | global     |
| `close project <board>`                                                          | `project close <board>`                                  | workspace  |
| `deploy [branch]`, `deploy stage`, `deploy on-release`, `deploy cleanup-preview` | =                                                        | as today   |
| `dev`, `dev serve`                                                               | =                                                        | as today   |
| `doctor [target]`, including `doctor variable-owners`                            | =                                                        | as today   |
| `export tokens [names..]`                                                        | `auth export` (the `names..` filter is new)              | workspace  |
| `install skills`                                                                 | `skills install`                                         | global     |
| `link account`                                                                   | `notifications link`                                     | workspace  |
| `list projects`                                                                  | `project list`                                           | workspace  |
| `list secrets`                                                                   | `secrets list`                                           | workspace  |
| `list skills`                                                                    | (new)                                                    | global     |
| `list tokens`                                                                    | `auth list`                                              | global     |
| `migrate issue \| issues \| project`                                             | =                                                        | workspace  |
| `move issues <from> <to>`                                                        | `project move <from> <to>`                               | workspace  |
| `new channel [name]`                                                             | `notifications channel add`                              | workspace  |
| `new github-app`                                                                 | `github-app create`                                      | global     |
| `new plugin \| repo`                                                             | =                                                        | global     |
| `new project [template]`                                                         | `project create`                                         | workspace  |
| `new secret [name] [value]`                                                      | `secrets set`                                            | workspace  |
| `new server [--provider]`                                                        | `notifications create-server`                            | workspace  |
| `new spec <issue>`                                                               | `ideas promote <issue>`                                  | workspace  |
| `new token [provider] [value]`                                                   | `auth set`                                               | global     |
| `new tunnel`                                                                     | `tunnel up`                                              | workspace  |
| `probe [provider] [probe] [args..]`                                              | =                                                        | workspace  |
| `provider [name] [action]`                                                       | =                                                        | workspace  |
| `publish bump-versions [new-version]`                                            | `package bump-versions`                                  | global     |
| `publish package`                                                                | `package publish` (keeps `--initial` and `--sync-trust`) | global     |
| `publish tag [group] [release]`                                                  | `package move-tag`                                       | global     |
| `reconcile project [board]`                                                      | `project reconcile`                                      | workspace  |
| `remove skill [names..]`                                                         | `skills remove` (no name needs `--all`)                  | global     |
| `remove token [provider]`                                                        | `auth unset`                                             | global     |
| `resolve checks`                                                                 | `monitoring resolve-checks`                              | workspace  |
| `run <task> [job]`, `run ci`, `run lint commit-msg`                              | =                                                        | as today   |
| `setup`                                                                          | `repo setup`                                             | workspace  |
| `setup notifications`                                                            | `notifications setup`                                    | workspace  |
| `setup project`                                                                  | `project setup`                                          | workspace  |
| `show config`                                                                    | `config show`                                            | repo-aware |
| `sync [steps..]`                                                                 | `repo sync [steps..]`                                    | workspace  |
| `sync github \| issues`                                                          | =                                                        | workspace  |
| `sync ideas`                                                                     | `ideas sync`                                             | workspace  |
| `sync readme`                                                                    | `repo sync readme`                                       | repo-aware |
| `sync roles [--provider]`                                                        | `notifications sync-roles`                               | workspace  |
| `sync secrets [environmentId]`                                                   | `secrets sync`                                           | workspace  |
| `sync specs`                                                                     | `specs sync`                                             | workspace  |
| `update skills [name]`                                                           | `skills update`                                          | global     |
| `upgrade node [to] \| deps`                                                      | `repo upgrade node \| deps`                              | global     |

Groups that disappear: `auth`, `skills`, `project`, `package`, `repo`, `specs`, `ideas`, `secrets`, `tunnel`,
`github-app`, `config`, `notifications`, `monitoring`. Groups that remain: `deploy`, `dev`, `migrate`, `new`,
`publish`, `run`, `sync`, `doctor`, `probe`, `provider`.

### Decisions worth recording

- **`new spec <issue>`, not `new issue` or `export issue`.** The command reads an issue and writes a
  `status: draft` spec file from it, never overwriting. `export issue` would read as the `Issues.export` records
  that `migrate` and `sync issues` use.
- **`move issues`, not `migrate project`.** `migrate project` copies a board's issues from one tracker to another;
  `move issues` stays inside one provider and moves the open items between two boards, keeping status and priority.
- **`check resolved` is separate from `check monitor`.** It needs no config and no plugin (`global`); execution context
  is looked up by the command name, so a flag cannot change it.
- **`check token` is not `doctor tokens`.** `check token` re-verifies one stored bootstrap token and works from a
  global install; `doctor tokens` compares every token the configured plugins take and needs the plugins.
- **`cleanup posts`** takes the new `notifications dedupe`, which deletes the extra posts of a forum for one key. It
  deletes, so it keeps its confirmation (`--yes`, refusing without a terminal).
- **`1password export-environment`** is a probe (`probe 1password export-environment`), not a command, and is not
  renamed; `export tokens` is the keyring's tokens, the probe is a 1Password Environment.

## Design

### yargs

Nested `.command()` groups as today. `sync` and `setup` get a `$0`-style default command (like `deploy [branch]`) so
`sync`, `sync github` and `setup project` all parse. `new`, `list`, `remove`, `check`, `export`, `install`, `update`,
`close`, `move`, `reconcile`, `resolve`, `link`, `cleanup`, `apply`, `show`, `upgrade` and `publish` are groups with no
default handler (a bare call prints its subcommands). A command named `version` is not used, so nothing collides with
yargs' own `--version`.

`remove skill` with no name used to remove every installed skill. It now requires `--all` for that, and on a terminal a
bare call lists the installed skills and asks.

### Execution contexts

`COMMAND_CONTEXTS` keys are the full command names, so every key is renamed (the table above carries the context).
`contexts.test.ts` fails on a command with no entry, which guards the rename.

### Interactive menu

Every `COMMAND_REGISTRY` entry is renamed, and the `group` values follow the verbs. `setup` appears three times
(`setup`, `setup project`, `setup notifications`) and needs labels that tell them apart in the menu. `package publish`
keeps its `modes` (steady-state, `--initial`, `--sync-trust`) under `publish package`. The completeness test that
checks the registry against the registered commands stays.

## Blast radius

- `cli/cli/src/cli.ts`, `commands/*/*.command.ts`, `*.entry.ts`, `contexts/contexts.ts`, `interactive-menu/` and their
  tests; the `command:` strings in `COMMAND_REGISTRY`.
- `.husky` hooks, `holocron` composite action and the astromech registry `local: { command }` entries, thin callers and
  reusable workflows that name an old command (`package bump-versions`, `repo sync`, `sync github`, `secrets sync`,
  `deploy on-release`, `doctor ...`); regenerate and let `holocron sync github` push.
- `release.config.ts`, `scripts/bump-versions.mjs` and `ci.release.yml` (`package bump-versions`, `package publish
--sync-trust` in the Trusted Publishing notes).
- Strings in messages and hints that print an old command name (CLI, plugins, `apps/sentinel`), including the
  `missing-token` hints and `doctor` rows that say what to run.
- Docs: `cli/cli/README.md`, `AGENTS.md`, `.holocron/org.md`, `docs/src/content/docs/**` (commands, tokens,
  environment-variables), the specs and ADRs that name a command, and the `probe tasks names` and
  `probe references` scans.
- Downstream repos on older synced templates keep calling the old names until they re-sync, since there are no
  aliases. The release notes say so.

## Release

No `!` and no `BREAKING CHANGE:` footer, as in SPEC-0040: the project is on `alpha`, so the rename stays within v5.

## Rollout

1. Issue (#2082) and this spec. SPEC-0040 is marked superseded when this spec is accepted, in the first
   implementation PR, since only its regrouping is replaced (`deploy [branch]`, `run ci` and the menu completeness test
   stay).
2. Stacked PRs by verb, each with its reference sweep, tests and docs: `new` and `list`/`remove`/`check`/`export`
   first (they absorb commands from several groups), then `sync`, `setup`, `upgrade`/`cleanup`/`apply`, then
   `publish`, `close`/`move`/`reconcile`, `link`/`resolve`/`show`, then the last group removals.
3. A final check that `holocron probe tasks names` and a grep for every old command name come back clean.
4. Manual: run `holocron sync github` to push the regenerated reusable templates (needs the sync token).

## Out of scope

- Deprecated aliases (decided against).
- New behaviour, except `list skills`, `export tokens [names..]` and `remove skill --all`.
- `doctor`, `probe` and `provider`.

## Open questions

- Should `check token` check every stored token when no provider is given (`check tokens [providers..]`)?
- Should a later `new issue` file an issue from the CLI?
