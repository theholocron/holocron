---
title: Token Reference
description: Fine-grained GitHub PATs and provider-native tokens used by the Holocron CLI.
---

Holocron uses one Personal Access Token per capability group. Each token carries only the scopes its operations require — a leaked token's blast radius is contained to that feature alone.

## GitHub feature token resolution

For GitHub feature tokens (`HOLOCRON_READ_TOKEN`, `HOLOCRON_ADMIN_TOKEN`, etc.), the chain is:

```
--token flag
  → HOLOCRON_<FEATURE>_TOKEN   (feature-specific env var)
  → keyring("github.<feature>") (stored via `holocron auth set`)
```

No broad-token fallback. If none of the above is set, the command exits with an error naming the exact env var to configure.

## Provider token resolution

For every other provider plugin (Cloudflare, Sentry, Slack, Vercel, etc.), tokens are resolved in this order:

```
--token flag
  → HOLOCRON_<PROVIDER>_TOKEN   (e.g. HOLOCRON_CLOUDFLARE_TOKEN)
  → <VENDOR>_TOKEN              (e.g. CLOUDFLARE_API_TOKEN)
  → keyring("<provider>.<org>") (org-scoped — only when an org is active)
  → keyring("<provider>")       (unnamespaced fallback)
```

The org-scoped keyring step fires when an org name is active. Org resolution order:

1. `--org <name>` CLI flag — per-invocation override
2. `HOLOCRON_ORG` env var — set in shell profile, `.envrc`, or CI secret
3. `org` field in `holocron.config.ts` — automatic for projects that declare it

This lets a single machine hold separate credentials for multiple GitHub orgs without collision:

```bash
# Store per-org credentials once
holocron auth set cloudflare --org theholocron <TOKEN-A>
holocron auth set cloudflare --org client-co   <TOKEN-B>

# theholocron project (org: "theholocron" in config) → picks up TOKEN-A automatically
cd ~/Code/theholocron/some-project && holocron setup

# client-co project (org: "client-co" in config) → picks up TOKEN-B automatically
cd ~/Code/client-co/some-project && holocron setup

# One-off override
holocron setup --org client-co
```

## GitHub tokens

| Env var                  | Keyring key      | Type               | Used by                                                                          | Required scopes                                                                                                |
| ------------------------ | ---------------- | ------------------ | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `HOLOCRON_READ_TOKEN`    | `github.read`    | Fine-grained       | `clone`, CI run listing                                                          | `contents: read`, `actions: read`, `metadata: read`                                                            |
| `HOLOCRON_ISSUES_TOKEN`  | `github.issues`  | Fine-grained       | `issues` capability (create, transition, comment)                                | `issues: read/write`, `metadata: read`                                                                         |
| `HOLOCRON_SYNC_TOKEN`    | `github.sync`    | Fine-grained       | `sync-github` — push workflow templates, open PRs                                | `contents: read/write`, `pull_requests: read/write`, `workflows: read/write`                                   |
| `HOLOCRON_RELEASE_TOKEN` | `github.release` | Fine-grained       | semantic-release: tags, releases, changelogs                                     | `contents: read/write`, `issues: read/write`, `pull_requests: read/write`                                      |
| `HOLOCRON_ADMIN_TOKEN`   | `github.admin`   | Fine-grained       | `setup` — branch protection, rulesets, secrets, environments, labels, properties | `administration: read/write`, `secrets: read/write`, `environments: read/write`                                |
| `HOLOCRON_DEPLOY_TOKEN`  | `github.deploy`  | Fine-grained       | `setup` — GitHub Pages (build type, custom domain, HTTPS)                        | `pages: read/write`, `metadata: read`                                                                          |
| `HOLOCRON_ORG_TOKEN`     | `github.org`     | Fine-grained (org) | `setup` — team sync and org-level custom property values                         | Resource owner: org · `administration: write` · `members: read` · `organization_custom_properties: read/write` |

### Why a separate org token?

Fine-grained PATs have two resource owner modes: **personal** (your repos) and **organization** (org repos). Team management and org-level custom properties both require a PAT whose resource owner is the org. `HOLOCRON_ORG_TOKEN` covers these; `HOLOCRON_ADMIN_TOKEN` covers all repo-scoped operations.

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
