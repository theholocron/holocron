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

| Env var                  | Keyring key      | Type               | Used by                                                                                         | Required scopes                                                                                                |
| ------------------------ | ---------------- | ------------------ | ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `HOLOCRON_READ_TOKEN`    | `github.read`    | Fine-grained       | holocron CLI — read-only access for clone and CI run listing                                    | `contents: read`, `actions: read`, `metadata: read`                                                            |
| `HOLOCRON_ISSUES_TOKEN`  | `github.issues`  | Fine-grained       | holocron CLI — issue management (create, transition, comment)                                   | `issues: read/write`, `metadata: read`                                                                         |
| `HOLOCRON_SYNC_TOKEN`    | `github.sync`    | Fine-grained       | holocron CLI — sync workflow templates, open sync PRs, and dispatch sync workflows across repos | `actions: read/write`, `contents: read/write`, `pull_requests: read/write`, `workflows: read/write`            |
| `HOLOCRON_RELEASE_TOKEN` | `github.release` | Fine-grained       | holocron CLI — semantic-release: create tags, releases, and changelogs                          | `contents: read/write`, `issues: read/write`, `pull_requests: read/write`                                      |
| `HOLOCRON_ADMIN_TOKEN`   | `github.admin`   | Fine-grained       | `setup` — branch protection, rulesets, secrets, environments, labels, properties                | `administration: read/write`, `secrets: read/write`, `environments: read/write`                                |
| `HOLOCRON_DEPLOY_TOKEN`  | `github.deploy`  | Fine-grained       | `setup` — GitHub Pages (build type, custom domain, HTTPS)                                       | `pages: read/write`, `metadata: read`                                                                          |
| `HOLOCRON_ORG_TOKEN`     | `github.org`     | Fine-grained (org) | `setup` — team sync and org-level custom property values                                        | Resource owner: org · `administration: write` · `members: read` · `organization_custom_properties: read/write` |

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

### CI-only exception: org-scoped secret writes

`secrets sync`'s `secrets` (GH Actions) destination always resolves through
`HOLOCRON_ADMIN_TOKEN`/`github.admin` by default — same as `setup`,
`doctor`, and `secret-set` — a **repo-scoped** fine-grained PAT. Writing an
**organization**-scoped secret (`--github-secret-scope org=<name>`, e.g.
Sentinel's `SENTINEL_AXIOM_INGEST_TOKEN` — holocron#781/#800) needs a
different, org-resource-owner credential with the org-level `secrets:
read/write` permission — none of the 7 tokens above carry it (`github.admin`
is repo-scoped; `github.org` is org-scoped but for
administration/members/properties, not secrets).

Rather than widening an existing token's blast radius, `.github/workflows/
sentinel.secretsSync.yml` passes a dedicated one via the explicit-override
form above: `--token github=${{ secrets.HOLOCRON_SECRETS_TOKEN }}`. This is
a repo secret on `holocron` only (not a `HOLOCRON_<FEATURE>_TOKEN` env var
in the resolution chain — it only ever reaches the CLI via `--token`, never
by env-var auto-detection), so it can't accidentally widen what any other
command's default resolution picks up. Locally, the equivalent is `--token
github=$(gh auth token)` — your own already-authenticated `gh` CLI session
already has org-secrets permission (it's almost certainly how this secret
was set in the first place), so no dedicated token is needed for a one-off
manual run outside CI.

**Provisioning `HOLOCRON_SECRETS_TOKEN`** (one-time): a fine-grained PAT,
resource owner **organization** (`theholocron`), with only the
organization-level **Secrets: read/write** permission — nothing else.
Store it as a repo secret on `holocron`:

```sh
gh secret set HOLOCRON_SECRETS_TOKEN --repo theholocron/holocron
```

---

# Third-party provider tokens

## Fern (`wiki.yml`)

Generate a token at `dashboard.buildwithfern.com` → **Settings → API tokens**.

**Resolution order:**

```
--token flag
  → HOLOCRON_FERN_TOKEN   (env var)
  → FERN_TOKEN            (Fern's native env var — vendor fallback)
  → keyring "fern.<org>"        (org-namespaced; e.g. "fern.theholocron" when org: theholocron)
  → keyring "fern"              (unnamespaced fallback)
```

**Store in keyring** (recommended for local use):

```sh
holocron auth set fern <token>
```

**Or via env var:**

```sh
export HOLOCRON_FERN_TOKEN=<token>
# Also recognised:
export FERN_TOKEN=<token>
```

**CI (GitHub Actions):** add `HOLOCRON_FERN_TOKEN` as a repository or org
secret. The `wiki.yml` reusable workflow picks it up via `secrets: inherit`
and maps it to `FERN_TOKEN` for the Fern CLI.

## Vercel + Doppler (Sentinel's CI, `.github/workflows/sentinel.*.yml`)

Sentinel's two hand-maintained workflows (holocron#800) — `sentinel.deploy.yml`
and `sentinel.secretsSync.yml` — read these as plain repo secrets on `holocron`
(not the `HOLOCRON_<FEATURE>_TOKEN` chain — `holocron-plugin-vercel`/
`holocron-plugin-doppler` fall back to each vendor's own native env var name
directly):

| Secret                   | Vendor env var  | Used by                                                                      | Scope                                                                                                                                                                                                                                      |
| ------------------------ | --------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `VERCEL_TOKEN`           | `VERCEL_TOKEN`  | both workflows — `holocron deploy`/`secrets sync`'s `deployment` destination | A Vercel personal access token (Vercel has no separate "service token" concept) — same one `holocron auth set vercel <token>` stores locally                                                                                               |
| `SENTINEL_DOPPLER_TOKEN` | `DOPPLER_TOKEN` | `sentinel.secretsSync.yml` only — reads the vault                            | A Doppler **Service Token** scoped to the `sentinel` project's `prd` config, **read-only** — CI only ever reads, never writes, so a scoped-down service token (not the personal CLI login token used locally) is the right credential here |

Provision both as repo secrets on `holocron`:

```sh
gh secret set VERCEL_TOKEN --repo theholocron/holocron
gh secret set SENTINEL_DOPPLER_TOKEN --repo theholocron/holocron
```

Password protection is configured in the Fern Dashboard only — no token is
needed for `holocron setup`.
