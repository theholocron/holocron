# GitHub Token Reference

Holocron uses one Personal Access Token per capability group. Each token carries only the scopes its operations require — a leaked token's blast radius is contained to that feature alone.

## Resolution chain

For every feature, the token is resolved in this order:

```text
--token flag
  → HOLOCRON_<FEATURE>_TOKEN   (feature-specific env var)
  → keyring("github.<feature>") (stored via `holocron auth set`)
```

No broad-token fallback. If none of the above is set, the command exits with an error naming the exact env var to configure.

## Feature tokens

| Env var                    | Keyring key        | Type               | Used by                                                                                                                 | Required scopes                                                                                                |
| -------------------------- | ------------------ | ------------------ | ----------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `HOLOCRON_READ_TOKEN`      | `github.read`      | Fine-grained       | holocron CLI — read-only access for clone and CI run listing                                                            | `contents: read`, `actions: read`, `metadata: read`                                                            |
| `HOLOCRON_ISSUES_TOKEN`    | `github.issues`    | Fine-grained       | holocron CLI — issue management (create, transition, comment)                                                           | `issues: read/write`, `metadata: read`                                                                         |
| `HOLOCRON_SYNC_TOKEN`      | `github.sync`      | Fine-grained       | holocron CLI — sync workflow templates, open sync PRs, and dispatch sync workflows across repos                         | `actions: read/write`, `contents: read/write`, `pull_requests: read/write`, `workflows: read/write`            |
| `HOLOCRON_RELEASE_TOKEN`   | `github.release`   | Fine-grained       | holocron CLI — semantic-release: create tags, releases, and changelogs                                                  | `contents: read/write`, `issues: read/write`, `pull_requests: read/write`                                      |
| `HOLOCRON_ADMIN_TOKEN`     | `github.admin`     | Fine-grained       | `setup` — branch protection, rulesets, secrets, environments, labels, properties                                        | `administration: read/write`, `secrets: read/write`, `environments: read/write`                                |
| `HOLOCRON_DEPLOY_TOKEN`    | `github.deploy`    | Fine-grained       | `setup` — GitHub Pages (build type, custom domain, HTTPS)                                                               | `pages: read/write`, `metadata: read`                                                                          |
| `HOLOCRON_ORG_TOKEN`       | `github.org`       | Fine-grained (org) | `setup` — team sync and org-level custom property values; `sync-roles` — read a team's members                          | Resource owner: org · `administration: write` · `members: read` · `organization_custom_properties: read/write` |
| `HOLOCRON_USER_SYNC_TOKEN` | `github.user-sync` | Fine-grained       | `notifications link` and `sync-roles` — read and write the files that link GitHub accounts to members of other services | Repository: **only** `.github-private` · `contents: read/write`                                                |

### Why a separate org token?

Fine-grained PATs have two resource owner modes: **personal** (scoped to repos you own) and **organization** (scoped to repos within the org). Team management and org-level custom properties both require a PAT whose resource owner is the org. `HOLOCRON_ORG_TOKEN` covers these; `HOLOCRON_ADMIN_TOKEN` covers all repo-scoped operations.

### Discord

Discord has three separate credentials, each used by a different step, so a leak of one reaches only that step. None is a GitHub token.

| Env var                                                         | Keyring key             | What it is                                             | Used by                                                                      | Get it from                                  |
| --------------------------------------------------------------- | ----------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------- | -------------------------------------------- |
| `HOLOCRON_DISCORD_BOT_TOKEN` (also `DISCORD_BOT_TOKEN`)         | `discord.holonet`       | The bot's token                                        | `notifications setup`, `create-server`, `sync-roles`, `doctor notifications` | Developer portal → Bot → **Reset Token**     |
| `HOLOCRON_DISCORD_CLIENT_SECRET` (also `DISCORD_CLIENT_SECRET`) | `discord.holonet.oauth` | The application's OAuth2 client secret                 | `notifications link` (signing people in)                                     | Developer portal → OAuth2 → **Reset Secret** |
| `HOLOCRON_NOTIFY_WEBHOOK_<CHANNEL>` (a GitHub secret)           | _(none)_                | A channel's webhook URL; anyone with it can post there | Workflows posting to a channel; the delivery check in `doctor notifications` | Created and stored by `notifications setup`  |

The bot token and the client secret look alike and are not interchangeable.

**What the bot needs in the server.** `setup` and `create-server` need View Channels, Send Messages, Read Message History, Manage Channels, Manage Roles, Manage Webhooks, Manage Server, Create Public Threads, Create Private Threads and Send Messages in Threads. When one is missing, the command prints an invite link that asks for exactly these and updates the bot's role in place. A server the bot creates itself needs none of this while it owns the server.

**What the application needs in the developer portal.** The **Server Members Intent** (switched on by `application.intents.members` in the layout) for `sync-roles`, and the redirect `http://localhost:53682/callback` under OAuth2 → Redirects for `notifications link`. Making the bot public, and the verification review, stay manual.

**GitHub tokens the Discord steps also use**

| Step                                                   | Token                  | Why                                                                                       |
| ------------------------------------------------------ | ---------------------- | ----------------------------------------------------------------------------------------- |
| `setup` storing webhook URLs and role ids              | `github.secrets` (org) | Writes organization secrets (`HOLOCRON_NOTIFY_*`)                                         |
| `sync-roles` reading a team                            | `github.org` (org)     | `members: read` on the organization                                                       |
| `link` and `sync-roles` reading/writing the links file | `github.user-sync`     | `contents: read/write` on `.github-private` only; separate so it cannot touch other repos |

Setup order for a new machine is in [Server as Code](https://theholocron.github.io/holocron/server-as-code/).

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
holocron clone --token github=ghp_xxx theholocron/holocron
holocron sync github --token github=ghp_zzz
```

### Org-scoped secret writes

The `secrets` capability (what `secrets sync`'s GH Actions destination,
`secret-set` and `notifications setup` write through) picks its token **by
scope**:

| Scope written                   | Token tried first                                   | Falls back to                                   |
| ------------------------------- | --------------------------------------------------- | ----------------------------------------------- |
| **organization** (`org=<name>`) | `HOLOCRON_SECRETS_TOKEN` / keyring `github.secrets` | `HOLOCRON_ADMIN_TOKEN` / keyring `github.admin` |
| repository, environment         | `HOLOCRON_ADMIN_TOKEN` / keyring `github.admin`     | `HOLOCRON_SECRETS_TOKEN` / `github.secrets`     |

An explicit `--token` serves every scope.

The split exists because the two permissions are different credentials.
`github.admin` is a **repo-scoped** fine-grained PAT, the same one `setup`
and `doctor` use. Writing an **organization**-scoped secret (e.g. Sentinel's
`SENTINEL_AXIOM_INGEST_TOKEN` — holocron#781/#800, or the notification
webhooks) needs an org-resource-owner credential with the org-level
`secrets: read/write` permission, which none of the other tokens carry
(`github.org` is org-scoped but for administration/members/properties). A
dedicated token keeps that permission off `github.admin`'s blast radius; a
dedicated org-only token cannot write repo secrets, which is why repo and
environment scopes still prefer `github.admin`. A setup with only one of the
two keeps working: it serves every scope.

`.github/workflows/sentinel.secretsSync.yml` passes its repo secret explicitly
with `--token github=${{ secrets.HOLOCRON_SECRETS_TOKEN }}`. Locally, store the
same kind of token with `holocron auth set github.secrets <token>`, or pass
`--token github=$(gh auth token)` for a one-off run if your `gh` session
carries org-secrets permission. See "Provisioning `HOLOCRON_SECRETS_TOKEN`"
below for the exact setup steps.

### CI-only exception: GitHub Deployments

`delivery.previewDeploy`'s reusable workflow (any package opting into the
task — currently Sentinel, holocron#1010/#1022) creates a GitHub
Deployment and posts its status for each PR preview, so that
`delivery.previewCheck` has a `deployment_status` event to trigger on.
None of the 7 feature tokens above carry the `deployments` permission —
`github.admin` is the closest repo-scoped token, but widening it only for
this would hand deployment write access to every other command that
resolves `github.admin`.

A dedicated `HOLOCRON_DEPLOYMENTS_TOKEN` carries **only** `deployments:
read/write`, following the same reasoning as `HOLOCRON_SECRETS_TOKEN`
above: a repo secret on `holocron`, consumed solely via the reusable
workflow's `secrets: inherit` (not a `HOLOCRON_<FEATURE>_TOKEN` env var in
the CLI's own resolution chain — nothing in `packages/cli` reads it; it
only ever reaches `gh api` inside the workflow). See "Provisioning
`HOLOCRON_DEPLOYMENTS_TOKEN`" below.

---

## Third-party provider tokens

### Fern (`wiki.yml`)

Generate a token at `dashboard.buildwithfern.com` → **Settings → API tokens**.

**Resolution order:**

```text
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

Password protection is configured in the Fern Dashboard only — no token is
needed for `holocron repo setup`.

### Vercel + Doppler (Sentinel's CI, `.github/workflows/sentinel.*.yml`)

Sentinel's two hand-maintained workflows (holocron#800) — `sentinel.deploy.yml`
and `sentinel.secretsSync.yml` — read these as plain repo secrets on `holocron`
(not the `HOLOCRON_<FEATURE>_TOKEN` chain — `holocron-plugin-vercel`/
`holocron-plugin-doppler` fall back to each vendor's own native env var name
directly):

| Secret                   | Vendor env var  | Used by                                                                      | Scope                                                                                                                                                                                                                                      |
| ------------------------ | --------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `VERCEL_TOKEN`           | `VERCEL_TOKEN`  | both workflows — `holocron deploy`/`secrets sync`'s `deployment` destination | A Vercel personal access token (Vercel has no separate "service token" concept) — same one `holocron auth set vercel <token>` stores locally                                                                                               |
| `SENTINEL_DOPPLER_TOKEN` | `DOPPLER_TOKEN` | `sentinel.secretsSync.yml` only — reads the vault                            | A Doppler **Service Token** scoped to the `sentinel` project's `prd` config, **read-only** — CI only ever reads, never writes, so a scoped-down service token (not the personal CLI login token used locally) is the right credential here |

#### Provisioning `VERCEL_TOKEN`

Reuse the token `holocron auth` already has stored locally (`holocron auth
list` shows `vercel — user @ <you>`) — pipe it straight from the keychain
into the GH secret so it's never typed or displayed:

```sh
security find-generic-password -s "com.theholocron.cli" -a "vercel" -w | gh secret set VERCEL_TOKEN --repo theholocron/holocron
```

macOS will prompt to approve keychain access the first time — allow it.
A dedicated CI-only token (generated at `vercel.com/account/tokens`) works
as well if you'd rather keep local and CI usage separated; there's no
scoped-down "service token" alternative either way, since Vercel doesn't
have one.

#### Provisioning `SENTINEL_DOPPLER_TOKEN`

A **Service Token**, not your personal Doppler login — Doppler's own
mechanism for exactly this case (CI credential, independent of any human
account, scoped to one project + config):

1. Doppler dashboard → `sentinel` project → `prd` config → **Access** tab
   → **Service Tokens**.
2. "Generate Service Token" — name it `holocron-ci` (or similar).
3. Access: **Read** only — this workflow never writes to Doppler.
4. Copy the generated token, then:

```sh
gh secret set SENTINEL_DOPPLER_TOKEN --repo theholocron/holocron
```

#### Provisioning `HOLOCRON_SECRETS_TOKEN`

A fine-grained PAT with only org-level Secrets access. The `secrets`
capability reads it as `HOLOCRON_SECRETS_TOKEN` or the keyring key
`github.secrets` (before falling back to `github.admin`), and
`sentinel.secretsSync.yml` passes it explicitly with `--token`:

1. `github.com/settings/tokens?type=beta` → "Generate new token."
2. **Resource owner**: `theholocron` (org, not personal).
3. **Token name**: `HOLOCRON_SECRETS_TOKEN`.
4. **Description**: `CI-only — org-scoped GH Actions secret writes for Sentinel's SENTINEL_AXIOM_INGEST_TOKEN sync (holocron#781/#800). Grants ONLY organization Secrets: read/write. Never used interactively — only referenced via --token in .github/workflows/sentinel.secretsSync.yml.`
5. **Repository access**: doesn't matter for this token (org secrets aren't repo-scoped) — "Public Repositories (read-only)" is a safe no-op choice GitHub's form still requires picking.
6. **Permissions → Organization permissions → Secrets**: **Read and write**. Leave every other repository and organization permission at "No access."
7. Generate, copy the value, then:

```sh
gh secret set HOLOCRON_SECRETS_TOKEN --repo theholocron/holocron
```

#### Provisioning `HOLOCRON_DEPLOYMENTS_TOKEN`

Another brand-new, single-purpose fine-grained PAT — reaches `gh` inside
the `delivery.previewDeploy` reusable workflow only, via `secrets:
inherit` on the thin caller, never through the CLI's own token
resolution:

1. `github.com/settings/tokens?type=beta` → "Generate new token."
2. **Resource owner**: `theholocron` (org) — repos opting into
   `delivery.previewDeploy` aren't necessarily only `holocron` itself.
3. **Token name**: `HOLOCRON_DEPLOYMENTS_TOKEN`.
4. **Description**: `CI-only — creates GitHub Deployments and posts their status for delivery.previewDeploy preview deploys (holocron#1010/#1022/#1024). Grants ONLY Deployments: read/write. Never used interactively — only referenced via secrets: inherit in the delivery.previewDeploy reusable workflow.`
5. **Repository access**: the repos that opt into `delivery.previewDeploy` (currently only `holocron`, for Sentinel) — unlike `HOLOCRON_SECRETS_TOKEN`, this permission IS repo-scoped.
6. **Permissions → Repository permissions → Deployments**: **Read and write**. Leave every other permission at "No access."
7. Generate, copy the value, then:

```sh
gh secret set HOLOCRON_DEPLOYMENTS_TOKEN --repo theholocron/holocron
```

#### None of these three belong in the local keyring

All three are CI-only by design — deliberately kept out of
`holocron auth set`'s local resolution chain:

- **`HOLOCRON_DEPLOYMENTS_TOKEN`** likewise has no keyring key or CLI
  resolver — nothing in `packages/cli` ever calls the GitHub Deployments
  API directly; only the reusable workflow's own `gh api` calls use it.
  The local equivalent, for a one-off manual test, is `GH_TOKEN=$(gh auth
token) gh api repos/<owner>/<repo>/deployments ...` with your own
  already-authenticated session, same as above.
- **`SENTINEL_DOPPLER_TOKEN`** _could_ technically go under keyring key
  `doppler`, but shouldn't — that key already holds your personal Doppler
  login (full account access). Overwriting it with a config-scoped,
  read-only service token would break anything local that needs broader
  Doppler access (e.g. `holocron repo setup`'s project/environment bootstrap
  calls).
- **`VERCEL_TOKEN`**, if reused from your existing personal token, is
  already in the keyring — nothing to add. A dedicated CI-only token has
  no local use case, so it doesn't need a keyring entry either.

The rule: the keyring is for tokens a _local_ `holocron` command needs to
resolve automatically. Anything that only ever runs inside a GitHub
Actions job doesn't need a local home.
