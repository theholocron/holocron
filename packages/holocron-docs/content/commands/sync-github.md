---
title: "sync-github"
description: Sync workflow templates and composite actions to theholocron/.github via the GitHub API.
---

```bash
holocron sync-github [--repo owner/repo] [--branch <branch>] [--pr] [--message <msg>] [--output-dir <path>] [--dry-run]
```

Generates workflow thin callers and composite action files from the source-of-truth templates in `packages/cli/src/commands/` and pushes them to `theholocron/.github` (or any target repo). This is an internal CI command — the `sync-workflow-templates` workflow in holocron itself runs it automatically on push to `main`.

## Options

| Option         | Default                                 | Description                                                                           |
| -------------- | --------------------------------------- | ------------------------------------------------------------------------------------- |
| `--repo`       | `theholocron/.github`                   | Target `owner/repo` to push generated files to                                        |
| `--branch`     | _(default branch)_                      | Push to this branch instead of the default branch                                     |
| `--pr`         | `false`                                 | Open a PR after pushing to `--branch` (no-op without `--branch`)                      |
| `--message`    | `chore: sync from theholocron/holocron` | Commit message                                                                        |
| `--output-dir` | —                                       | Write generated files to a local directory instead of pushing (useful for validation) |
| `--dry-run`    | `false`                                 | Print what would be pushed without calling the GitHub API                             |

## Examples

```bash
# Push to theholocron/.github default branch
holocron sync-github

# Push to a PR branch (useful for protected repos)
holocron sync-github --branch chore/sync --pr

# Write locally for inspection
holocron sync-github --output-dir /tmp/sync-preview

# Dry-run
holocron sync-github --dry-run
```

## Authentication

Uses `HOLOCRON_SYNC_TOKEN` / `github.sync` keyring entry. Required scopes: `contents: read/write`, `pull_requests: read/write`, `workflows: read/write`.

When `--output-dir` is set, no GitHub API calls are made and no token is required.

## Notes

- If the target repo has branch protection on its default branch, use `--branch` + `--pr` to create a pull request that can be reviewed before merging.
- A closed-but-existing branch blocks future PR creation. If you close a sync PR without merging, delete the branch as well: `gh pr close <n> --delete-branch`.
