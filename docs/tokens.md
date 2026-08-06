# GitHub Token Reference

Holocron uses one Personal Access Token per capability group. Each token carries only the scopes its operations require — a leaked token's blast radius is contained to that feature alone.

## Resolution chain

For every feature, the token is resolved in this order:

```
--token flag
  → HOLOCRON_<FEATURE>_TOKEN   (feature-specific env var)
  → keyring("github.<feature>") (stored via `holocron auth set`)
```

No broad-token fallback. If none of the above is set, the command exits with an error naming the exact env var to configure.

## Feature tokens

| Env var                  | Keyring key      | Type               | Used by                                                                          | Required scopes                                                                 |
| ------------------------ | ---------------- | ------------------ | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `HOLOCRON_READ_TOKEN`    | `github.read`    | Fine-grained       | holocron CLI — read-only access for clone and CI run listing                     | `contents: read`, `actions: read`, `metadata: read`                             |
| `HOLOCRON_ISSUES_TOKEN`  | `github.issues`  | Fine-grained       | holocron CLI — issue management (create, transition, comment)                    | `issues: read/write`, `metadata: read`                                          |
| `HOLOCRON_SYNC_TOKEN`    | `github.sync`    | Fine-grained       | holocron CLI — sync workflow templates and open sync PRs across repos            | `contents: read/write`, `pull_requests: read/write`, `workflows: read/write`    |
| `HOLOCRON_RELEASE_TOKEN` | `github.release` | Fine-grained       | holocron CLI — semantic-release: create tags, releases, and changelogs           | `contents: read/write`, `issues: read/write`, `pull_requests: read/write`       |
| `HOLOCRON_ADMIN_TOKEN`   | `github.admin`   | Fine-grained       | `setup` — branch protection, rulesets, secrets, environments, labels, properties | `administration: read/write`, `secrets: read/write`, `environments: read/write` |
| `HOLOCRON_DEPLOY_TOKEN`  | `github.deploy`  | Fine-grained       | `setup` — GitHub Pages (build type, custom domain, HTTPS)                        | `pages: read/write`, `metadata: read`                                           |
| `HOLOCRON_ORG_TOKEN`     | `github.org`     | Fine-grained (org) | `setup` — team sync and org-level custom property values                         | Resource owner: org · `administration: write` · `members: read` · `organization_custom_properties: read/write` |

### Why a separate org token?

Fine-grained PATs have two resource owner modes: **personal** (scoped to repos you own) and **organization** (scoped to repos within the org). Team management and org-level custom properties both require a PAT whose resource owner is the org. `HOLOCRON_ORG_TOKEN` covers these; `HOLOCRON_ADMIN_TOKEN` covers all repo-scoped operations.

## Setting tokens via env vars

```sh
export HOLOCRON_READ_TOKEN=ghp_xxx
export HOLOCRON_ISSUES_TOKEN=ghp_yyy
export HOLOCRON_SYNC_TOKEN=ghp_zzz
export HOLOCRON_RELEASE_TOKEN=ghp_aaa
export HOLOCRON_ADMIN_TOKEN=ghp_bbb
export HOLOCRON_DEPLOY_TOKEN=ghp_ccc
export HOLOCRON_ORG_TOKEN=github_pat_xxx
```

## Storing tokens in the keyring

Run once per machine. Tokens are stored in the OS credential store (macOS Keychain, Windows Credential Manager, libsecret on Linux) and retrieved automatically on every command.

```sh
holocron auth set github.read     ghp_xxx
holocron auth set github.issues   ghp_yyy
holocron auth set github.sync     ghp_zzz
holocron auth set github.release  ghp_aaa
holocron auth set github.admin    ghp_bbb
holocron auth set github.deploy   ghp_ccc
holocron auth set github.org      github_pat_xxx
```

All tokens are stored under keychain service `com.theholocron.cli` with the keyring key as the account name. To retrieve a token manually on macOS:

```sh
security find-generic-password -s "com.theholocron.cli" -a "github.admin" -w
```

Verify a stored token:

```sh
holocron auth check github.admin
```

Remove a stored token:

```sh
holocron auth unset github.read
```

## CI secrets

In GitHub Actions, map your repository or org secrets to the expected env var names in each workflow's `env:` block:

```yaml
env:
    HOLOCRON_SYNC_TOKEN: ${{ secrets.SYNC_TOKEN }}
    HOLOCRON_RELEASE_TOKEN: ${{ secrets.RELEASE_TOKEN }}
```

## Explicit override

Pass a token directly for a single invocation without touching env vars or the keyring:

```sh
holocron clone --token github=ghp_xxx theholocron
holocron sync-github --token github=ghp_zzz
```
