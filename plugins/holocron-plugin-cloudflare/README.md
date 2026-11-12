<!-- editorconfig-checker-disable-file -->

# `@theholocron/holocron-plugin-cloudflare`

Cloudflare plugin for [Holocron](../cli). Implements the `dns`, `deployment`,
`workers` and `tunnels` capabilities against the
[Cloudflare v4 API](https://developers.cloudflare.com/api/).

## Install

<!-- prettier-ignore -->
```bash
pnpm add -D @theholocron/holocron-plugin-cloudflare

```

## Auth

Token resolution order:

1. `--token <TOKEN>` flag on the holocron invocation
2. `HOLOCRON_CLOUDFLARE_TOKEN` env var
3. `CLOUDFLARE_API_TOKEN` env var (the standard Cloudflare variable name)
4. Keyring `cloudflare.<org>` — tried first when an org is active via `--org`, `HOLOCRON_ORG`, or `org` in `holocron.config.ts`
5. Keyring `cloudflare` — unnamespaced fallback; set via `holocron new token cloudflare <token>`

Generate a scoped API token at **dash.cloudflare.com/profile/api-tokens**.

- **DNS only:** `Zone:Read`, `Zone:DNS:Edit`
- **DNS + Pages (deployment):** `Zone:Read`, `Zone:DNS:Edit`, `Cloudflare Pages:Edit`

## Config

<!-- prettier-ignore -->
```jsonc
{
  "providers": {
    // DNS management only
    "dns": "cloudflare",

    // Cloudflare Pages deployments (requires accountId)
    // accountId falls back to CLOUDFLARE_ACCOUNT_ID env var when omitted
    "deployment": "cloudflare",

    // Workers deployment (also requires accountId)
    "workers": "cloudflare",
  },
}

```

Any combination of capabilities can be enabled together:

<!-- prettier-ignore -->
```jsonc
{
  "providers": {
    "dns": "cloudflare",
    "deployment": "cloudflare",
    "workers": "cloudflare",
  },
}

```

The `deployment`, `workers` and `tunnels` capabilities are only exposed when `accountId`
is resolvable — either passed explicitly in options or set as the
`HOLOCRON_CLOUDFLARE_ACCOUNT_ID` (or `CLOUDFLARE_ACCOUNT_ID`) env var or in a `credentials` provider's Environment (the option wins, then the
environment, then the provider).

## `dns` capability

| Method         | What it does                                                                                                                                                                                                                        |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `listRecords`  | Lists all DNS records in the zone that contains the given domain. Resolves the zone by walking label-by-label from the full domain to the apex.                                                                                     |
| `upsertRecord` | Creates a record if none matching `type + name` exists; patches the first match otherwise. When multiple same-type records exist, only the first is updated — use explicit list/delete/create for multi-TXT scenarios (SPF + DKIM). |
| `deleteRecord` | Deletes a record by id within the zone that contains the given domain.                                                                                                                                                              |

Zone ids are cached per plugin instance for the lifetime of the process.

## `deployment` capability

Manages [Cloudflare Pages](https://developers.cloudflare.com/pages/) projects. Used by `holocron repo setup` to provision per-PR preview deployments.

| Method                  | What it does                                                                                                            |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `listProjects`          | Lists all Cloudflare Pages projects in the account.                                                                     |
| `ensureProject`         | Creates the Pages project if it does not exist; returns the existing project otherwise.                                 |
| `ensureCustomDomain`    | Attaches a custom domain (or wildcard) to the project if not already attached; idempotent.                              |
| `listDeployments`       | Lists recent deployments for the project.                                                                               |
| `triggerDeployment`     | Triggers a new Pages deployment from the latest production branch commit.                                               |
| `updateProjectSettings` | Updates project-level settings (currently a no-op; CF Pages REST API has no direct settings endpoint for these fields). |

## `workers` capability

Deploys and manages [Workers](https://developers.cloudflare.com/workers/) scripts.

| Method         | What it does                                                                                                                                                                                                                      |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `upsertProxy`  | Deploys a generated reverse-proxy Worker forwarding `hostname/*` to `config.target`, injecting `config.headers`. Used by `setup` to wire wiki custom-domain proxies when the wiki provider requires one in addition to the CNAME. |
| `deployScript` | Deploys (or updates) an arbitrary Worker script — the caller's own code, not a generated proxy — with optional secret bindings and route patterns. For a consumer that isn't a reverse-proxy, e.g. a webhook receiver.            |

Both methods are idempotent: re-running with the same inputs makes no
route-write call when nothing changed. Zone ids are cached per plugin
instance for the lifetime of the process — the `workers` capability's own
cache, separate from `dns`'s.

## `tunnels` capability

Named [Cloudflare Tunnels](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/): a stable
public hostname that reaches a port on this machine, for a webhook that has to find a development instance. It needs a
token with **Cloudflare Tunnel: Edit** (account).

| Method         | What it does                                                                                                                                                                                                                                               |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ensureTunnel` | Finds the tunnel by name or makes it, and makes its configuration serve `hostname` at `service`. Other hostnames' rules are kept and the catch-all (`http_status:404`) stays last. Returns the tunnel id and the `CNAME` target (`<id>.cfargotunnel.com`). |
| `tunnelToken`  | The token `cloudflared` runs the tunnel with. A credential: never printed or stored.                                                                                                                                                                       |
| `whoami`       | How many tunnels the token can see, for `holocron doctor`.                                                                                                                                                                                                 |

`ensureTunnel` is idempotent: a tunnel that already serves the hostname is not rewritten. The DNS record for the
hostname is the `dns` provider's job.

### Preview deployment setup

When `preview: true` (or `preview: { project, domain }`) is set in a repo's deploy config, `holocron repo setup` calls:

1. `ensureProject` — creates `<org>-preview` if it doesn't exist
2. `ensureCustomDomain` — attaches `*.<domain>` to the project
3. `dns.upsertRecord` — adds a wildcard CNAME `*.<domain>` → `<project>.pages.dev`

The combined `deploy.yml` thin caller then routes `push` events to GitHub Pages and `pull_request` events to Cloudflare Pages via `cloudflare/pages-action`. Preview URLs resolve as `<repo>-pr-<n>.<domain>`.
