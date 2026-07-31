---
title: "deploy"
description: Trigger a deployment via the configured deployment capability.
---

```bash
holocron deploy <branch> --project-id <id> [--target production|staging] [--dry-run]
```

Triggers a deployment of a git branch via the configured `deployment` capability (e.g. Vercel). Omit `--target` for a branch preview deployment.

## Arguments and options

| Argument / Option | Required | Description |
| --- | --- | --- |
| `<branch>` | Yes | Git branch to deploy |
| `--project-id` | Yes | Deployment project id (e.g. Vercel `prj_xxx`) |
| `--target` | No | `production` or `staging` — omit for a branch preview |
| `--dry-run` | No | Print what would be deployed without triggering |

## Examples

```bash
# Branch preview
holocron deploy feature/my-feature --project-id prj_xxx

# Production deploy
holocron deploy main --project-id prj_xxx --target production

# Staging deploy (dry-run)
holocron deploy main --project-id prj_xxx --target staging --dry-run
```

## Authentication

Uses the configured `deployment` plugin's token. For Vercel: `HOLOCRON_VERCEL_TOKEN` / `vercel` keyring entry.
