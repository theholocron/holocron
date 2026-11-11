# `@theholocron/holocron-plugin-github`

GitHub plugin for [Holocron](../cli). Implements six capabilities
against the GitHub REST and GraphQL APIs:

| Capability     | What this plugin does                                            |
| -------------- | ---------------------------------------------------------------- |
| `source`       | Repos, rulesets, repo settings, security toggles, workflow files |
| `ci`           | Workflow run history + status                                    |
| `secrets`      | GH Actions secrets (repo + environment + organization)           |
| `environments` | Named deployment environments (reviewers, wait timers)           |
| `issues`       | GitHub Issues as a tracker (with lifecycle slots)                |
| `projects`     | GitHub Projects v2 boards (GraphQL)                              |

## Install

<!-- prettier-ignore -->
```bash
pnpm add -D @theholocron/holocron-plugin-github@alpha

```

## Auth

Each capability resolves its own fine-grained token so a compromised credential can only affect that feature. The resolution chain per capability is:

```
--token flag → HOLOCRON_<FEATURE>_TOKEN → keyring("github.<feature>")
```

| Env var                  | Keyring key      | Capabilities                        |
| ------------------------ | ---------------- | ----------------------------------- |
| `HOLOCRON_READ_TOKEN`    | `github.read`    | `clone`, `ci`                       |
| `HOLOCRON_ISSUES_TOKEN`  | `github.issues`  | `issues`                            |
| `HOLOCRON_SYNC_TOKEN`    | `github.sync`    | `sync-github` command               |
| `HOLOCRON_RELEASE_TOKEN` | `github.release` | semantic-release, GitHub releases   |
| `HOLOCRON_ADMIN_TOKEN`   | `github.admin`   | `source`, `secrets`, `environments` |
| `HOLOCRON_ORG_TOKEN`     | `github.org`     | `projects`                          |

Store tokens once via the keyring so they are picked up automatically:

```sh
holocron new token github.read     ghp_xxx  # clone + CI run listing
holocron new token github.issues   ghp_xxx  # issue management
holocron new token github.sync     ghp_xxx  # sync-github workflow templates
holocron new token github.release  ghp_xxx  # semantic-release
holocron new token github.admin    ghp_xxx  # setup, secrets, environments
```

See the [token reference](https://docs.theholocron.dev/holocron/tokens/) for full scope requirements and CI setup.

## Config

<!-- prettier-ignore -->
```jsonc
// holocron.config.json
{
  "providers": {
    "source": "github",
    "ci": "github",
    "secrets": "github",
    "environments": "github",
    "issues": ["github", { "labels": { "inProgress": "status:in-progress", "inReview": "status:in-review" } }],
  },
}

```

## `projects` capability

GitHub Projects v2 boards over GraphQL, for `holocron project ...` (SPEC-0020, #1744). It uses the org token
(`HOLOCRON_ORG_TOKEN`, keyring `github.org`) with the **Projects** organization permission. Items are keyed `#N` in the
configured `repo` and `owner/repo#N` elsewhere.

| Method      | What it does                                                                                                                                                               |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `list`      | Every project of the organization, open and closed. `find` is the exact name among the open ones.                                                                          |
| `create`    | Copies the board `template.source` names (fields, options, views, automation rules, no items), or creates a project and applies the template.                              |
| `close`     | `updateProjectV2` with `closed: true`. Reversible.                                                                                                                         |
| `read`      | Statuses, other fields, board and table views and automation rules.                                                                                                        |
| `ensure`    | Adds what the template lists and the board lacks (options, fields, views, filters). Never deletes. Rules and view grouping the API cannot set come back as `todos`.        |
| `items`     | Each issue or pull request with its status, category, whether it is open and its open blockers.                                                                            |
| `setStatus` | Sets an item's status. Idempotent: `transitioned: false` when it is already there.                                                                                         |
| `move`      | Puts open items on another board with status and priority (only where the target has none); closed and merged ones stay and are set to done when theirs is not a done one. |
| `whoami`    | How many boards the token sees, for `holocron doctor`.                                                                                                                     |

`ensure` is safe on a field that has items. `updateProjectV2Field` replaces a single select field's whole option list,
and an option sent without its `id` blanks the field on every item, so `ensure` reads the field first, sends every
existing option with its `id` in the template's order (new ones without), and stops when the field cannot be read. It
also keeps the item values in memory and, if a re-read shows any gone, writes them back by option name and fails.

## Status

**`v2.0.0-alpha.0`** — published on npm under the `alpha` dist-tag.
[Release notes](https://github.com/theholocron/holocron/releases/tag/v2.0.0-alpha.0).
All five capabilities are implemented; APIs may still shift before
stable v2.0.0.
