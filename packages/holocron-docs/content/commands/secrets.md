---
title: "secrets sync"
description: Read a vault environment and fan KEY=VALUE pairs out to CI secrets and deployment env vars.
---

```bash
holocron secrets sync <environmentId> [--project-id <id>] [--target production preview] [--dry-run]
```

Pulls all secrets from a vault environment and fans them out to:
- **CI secrets** via the `secrets` capability (e.g. GitHub Actions secrets)
- **Deployment env vars** via the `deployment` capability (e.g. Vercel env vars) when `--project-id` is provided

This is the primary way to keep CI and deployment platform secrets in sync with the vault (1Password, Doppler, Infisical, etc.).

## Arguments and options

| Argument / Option | Default | Description |
| --- | --- | --- |
| `<environmentId>` | *(required)* | Vault environment id to read (provider-specific — e.g. a 1Password Environment id, Doppler config name) |
| `--project-id` | — | Deployment project id (e.g. Vercel `prj_xxx`). Required when syncing to the `deployment` capability |
| `--target` | `production preview` | Deployment targets to sync to (space-separated). Options: `development`, `preview`, `production` |
| `--dry-run` | `false` | Print what would be set without writing secrets |

## Examples

```bash
# Sync all secrets from the "production" Doppler config to GitHub Actions
holocron secrets sync production

# Also sync to Vercel's production and preview environments
holocron secrets sync production --project-id prj_xxx

# Only sync to production (not preview)
holocron secrets sync production --project-id prj_xxx --target production

# Dry-run to see what would be synced
holocron secrets sync production --dry-run
```

## Flow

1. The `vault` capability reads all KEY=VALUE pairs from `<environmentId>`
2. Each key is set as a CI secret (via the `secrets` capability) at repo scope
3. If `--project-id` is provided, each key is also set as a deployment env var for each `--target`

## Authentication

- Vault plugin token (e.g. `HOLOCRON_DOPPLER_TOKEN`, `HOLOCRON_INFISICAL_TOKEN`)
- `HOLOCRON_ADMIN_TOKEN` / `github.admin` for writing GitHub secrets
- Deployment plugin token (e.g. `HOLOCRON_VERCEL_TOKEN`) if `--project-id` is used
