---
title: "setup"
description: Apply all infra setup actions across every configured capability.
---

```bash
holocron setup [--repo owner/name] [--dry-run]
```

`setup` is the primary provisioning command. It applies a deterministic set of infrastructure actions for every configured capability. Each step is wrapped in a try/catch — failures are reported but don't abort subsequent steps. A summary at the end shows counts for ok, fail, and skip.

## What setup does

### Always (no capability required)

| Action                       | Output                                                                                                |
| ---------------------------- | ----------------------------------------------------------------------------------------------------- |
| Write `.editorconfig`        | Canonical editor settings (tab indent, LF line endings, etc.)                                         |
| Write `.alexrc.json`         | Shared inclusive-language allow-list                                                                  |
| Write `commitlint.config.ts` | CommitLint config extending `@theholocron/commitlint-config`                                          |
| Update `codecov.yml`         | Syncs `individual_components` to match `packages/*/` workspace entries                                |
| Install CI workflows         | Writes `.github/workflows/<name>.yml` for each entry in `workflows[]`                                 |
| Install agent skills         | Downloads and installs each skill from `skills[]` into `.agents/skills/` with agent-specific symlinks |

### `source` capability (GitHub plugin)

| Action                                 | Notes                                                       |
| -------------------------------------- | ----------------------------------------------------------- |
| Update repo settings                   | Squash-merge only, delete branch on merge, allow auto-merge |
| Apply branch protection                | `balanced` = ruleset; `strict` = ruleset + required checks  |
| Enable vulnerability alerts            | Dependabot alerts                                           |
| Enable automated security fixes        | Dependabot auto-PRs                                         |
| Enable secret scanning                 | Secret scanning alerts                                      |
| Enable private vulnerability reporting | Private advisories                                          |
| Enable dependency graph                | Dependency graph + snapshot submission                      |
| Enable CodeQL                          | Default setup with extended query suite                     |
| Configure Dependabot                   | Writes `.github/dependabot.yml`                             |
| Sync labels                            | Upserts canonical labels; removes stale ones                |
| Sync properties                        | Sets org-level custom properties from `repo.properties`     |
| Sync topics                            | Sets GitHub topics from `repo.topics`                       |
| Sync teams                             | Grants team access from `repo.teams`                        |
| Write `CODEOWNERS`                     | Generated for teams with write-or-higher permission         |

### `vault` capability

| Action              | Notes                                                                  |
| ------------------- | ---------------------------------------------------------------------- |
| `ensureProject`     | Creates the project container in the vault if absent                   |
| `ensureEnvironment` | Creates standard environments (`dev`, `stg`, `prd`) inside the project |

### `tooling` capability (Postman, etc.)

| Action   | Notes                                              |
| -------- | -------------------------------------------------- |
| `sync()` | Pulls the tool's authoritative state from the repo |

### `auth` capability (Clerk, etc.)

| Action             | Notes                                          |
| ------------------ | ---------------------------------------------- |
| `ensureWebhookApp` | Idempotent provisioning of the webhook backend |

## Options

| Option              | Description                                                            |
| ------------------- | ---------------------------------------------------------------------- |
| `--repo owner/name` | Override the repo coordinate                                           |
| `--dry-run`         | Print "would" lines for all mutating steps; read-only probes still run |

## Example

```bash
# Full setup
holocron setup

# Dry-run — see every action without executing
holocron setup --dry-run

# Target a specific repo
holocron setup --repo my-org/my-project
```

## Notes

- Workflow files written by `setup` are **generated artifacts** — overwritten on each run. Do not edit them manually; edit the workflow templates in `theholocron/holocron` and run `holocron sync-github` instead.
- Skills are gitignored and re-installed on each `setup` run. Running `setup` on a fresh clone restores them.
- `setup` is idempotent — running it again on the same repo produces the same result and does not create duplicate labels, environments, or teams.
