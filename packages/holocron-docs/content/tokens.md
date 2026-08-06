---
title: Token Reference
description: Fine-grained GitHub PATs and provider-native tokens used by the Holocron CLI.
---

Holocron uses one Personal Access Token per capability group. Each token carries only the scopes its operations require — a leaked token's blast radius is contained to that feature alone.

## Resolution chain

For every feature, the token is resolved in this order:

```
--token flag
  → HOLOCRON_<FEATURE>_TOKEN   (feature-specific env var)
  → keyring("github.<feature>") (stored via `holocron auth set`)
```

No broad-token fallback. If none of the above is set, the command exits with an error naming the exact env var to configure.

## GitHub tokens

| Env var                  | Keyring key      | Type               | Used by                                                                           | Required scopes                                                                 |
| ------------------------ | ---------------- | ------------------ | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `HOLOCRON_READ_TOKEN`    | `github.read`    | Fine-grained       | `clone`, CI run listing                                                           | `contents: read`, `actions: read`, `metadata: read`                             |
| `HOLOCRON_ISSUES_TOKEN`  | `github.issues`  | Fine-grained       | `issues` capability (create, transition, comment)                                 | `issues: read/write`, `metadata: read`                                          |
| `HOLOCRON_SYNC_TOKEN`    | `github.sync`    | Fine-grained       | `sync-github` — push workflow templates, open PRs                                 | `contents: read/write`, `pull_requests: read/write`, `workflows: read/write`    |
| `HOLOCRON_RELEASE_TOKEN` | `github.release` | Fine-grained       | semantic-release: tags, releases, changelogs                                      | `contents: read/write`, `issues: read/write`, `pull_requests: read/write`       |
| `HOLOCRON_ADMIN_TOKEN`   | `github.admin`   | Fine-grained       | `setup` — branch protection, rulesets, secrets, environments, labels, properties | `administration: read/write`, `secrets: read/write`, `environments: read/write` |
| `HOLOCRON_DEPLOY_TOKEN`  | `github.deploy`  | Fine-grained       | `setup` — GitHub Pages (build type, custom domain, HTTPS)                        | `pages: read/write`, `metadata: read`                                           |
| `HOLOCRON_ORG_TOKEN`     | `github.org`     | Fine-grained (org) | `setup` — org-level custom property values on repos                              | Resource owner: org · `organization_custom_properties: read/write`              |
| `HOLOCRON_CLASSIC_TOKEN` | `github.classic` | Classic PAT        | `setup` — team management (fallback when fine-grained PAT gets 403)              | `admin:org`                                                                     |

### Why a classic PAT for team sync?

`PUT /orgs/{org}/teams/{slug}/repos/{owner}/{repo}` does not accept fine-grained PATs regardless of what permissions are granted — GitHub has not migrated this endpoint. `HOLOCRON_CLASSIC_TOKEN` is only used as a fallback on that one call. Everything else uses fine-grained tokens.

### Why a separate org token?

Fine-grained PATs have two resource owner modes: **personal** (your repos) and **organization** (org repos). Setting org-level custom property values requires a PAT whose resource owner is the org. `HOLOCRON_ORG_TOKEN` fills this role; `HOLOCRON_ADMIN_TOKEN` covers all repo-scoped operations.

## Provider tokens

| Plugin      | Env var                       | Description                                             |
| ----------- | ----------------------------- | ------------------------------------------------------- |
| `vercel`    | `HOLOCRON_VERCEL_TOKEN`       | Vercel Personal Access Token                            |
| `1password` | _(none — uses `op` CLI auth)_ | `op signin` on laptop; `OP_SERVICE_ACCOUNT_TOKEN` in CI |
| `doppler`   | `HOLOCRON_DOPPLER_TOKEN`      | Doppler service token                                   |
| `infisical` | `HOLOCRON_INFISICAL_TOKEN`    | Infisical Universal Auth client secret                  |
| `clerk`     | `HOLOCRON_CLERK_SECRET_KEY`   | Clerk Backend Secret Key (`sk_live_…`)                  |
| `neon`      | `HOLOCRON_NEON_API_KEY`       | Neon API key                                            |
| `postman`   | `HOLOCRON_POSTMAN_API_KEY`    | Postman API key                                         |

## Storing tokens in the keyring

Run once per machine. Tokens are stored in the OS credential store and retrieved automatically.

```bash
holocron auth set github.read    ghp_xxx
holocron auth set github.issues  ghp_yyy
holocron auth set github.sync    ghp_zzz
holocron auth set github.release ghp_aaa
holocron auth set github.admin   ghp_bbb
holocron auth set github.deploy  ghp_ccc
holocron auth set github.org     github_pat_xxx
holocron auth set github.classic ghp_zzz
```

All tokens are stored under keychain service `com.theholocron.cli` with the keyring key as the account name. To retrieve a token manually on macOS:

```bash
security find-generic-password -s "com.theholocron.cli" -a "github.admin" -w
```

Verify, remove, or list stored tokens:

```bash
holocron auth check github.admin
holocron auth unset github.read
holocron auth list
```

## CI secrets

```yaml
env:
    HOLOCRON_SYNC_TOKEN: ${{ secrets.SYNC_TOKEN }}
    HOLOCRON_RELEASE_TOKEN: ${{ secrets.RELEASE_TOKEN }}
```

## Explicit override

```bash
# Bare form: fallback for all plugins
holocron clone --token ghp_xxx --org theholocron

# Keyed form: target a specific provider
holocron sync-github --token github=ghp_zzz

# Multiple providers
holocron setup --token github=ghp_xxx --token vercel=v_yyy
```
