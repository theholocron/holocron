<!-- editorconfig-checker-disable-file -->

# `@theholocron/holocron-plugin-cloudflare`

Cloudflare plugin for [Holocron](../cli). Implements the `dns` and `deployment`
capabilities against the [Cloudflare v4 API](https://developers.cloudflare.com/api/).

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
5. Keyring `cloudflare` — unnamespaced fallback; set via `holocron auth set cloudflare <token>`

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
  },
}

```

Both capabilities can be enabled together:

<!-- prettier-ignore -->
```jsonc
{
  "providers": {
    "dns": "cloudflare",
    "deployment": "cloudflare",
  },
}

```

The `deployment` capability is only exposed when `accountId` is resolvable — either passed explicitly in options or set via the `CLOUDFLARE_ACCOUNT_ID` env var.

## `dns` capability

| Method         | What it does                                                                                                                                                                                                                        |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `listRecords`  | Lists all DNS records in the zone that contains the given domain. Resolves the zone by walking label-by-label from the full domain to the apex.                                                                                     |
| `upsertRecord` | Creates a record if none matching `type + name` exists; patches the first match otherwise. When multiple same-type records exist, only the first is updated — use explicit list/delete/create for multi-TXT scenarios (SPF + DKIM). |
| `deleteRecord` | Deletes a record by id within the zone that contains the given domain.                                                                                                                                                              |

Zone ids are cached per plugin instance for the lifetime of the process.

## `deployment` capability

Manages [Cloudflare Pages](https://developers.cloudflare.com/pages/) projects. Used by `holocron setup` to provision per-PR preview deployments.

| Method                 | What it does                                                                                                              |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `listProjects`         | Lists all Cloudflare Pages projects in the account.                                                                       |
| `ensureProject`        | Creates the Pages project if it does not exist; returns the existing project otherwise.                                   |
| `ensureCustomDomain`   | Attaches a custom domain (or wildcard) to the project if not already attached; idempotent.                                |
| `listDeployments`      | Lists recent deployments for the project.                                                                                 |
| `triggerDeployment`    | Triggers a new Pages deployment from the latest production branch commit.                                                 |
| `updateProjectSettings`| Updates project-level settings (currently a no-op; CF Pages REST API has no direct settings endpoint for these fields).  |

### Preview deployment setup

When `preview: true` (or `preview: { project, domain }`) is set in a repo's deploy config, `holocron setup` calls:

1. `ensureProject` — creates `<org>-preview` if it doesn't exist
2. `ensureCustomDomain` — attaches `*.<domain>` to the project
3. `dns.upsertRecord` — adds a wildcard CNAME `*.<domain>` → `<project>.pages.dev`

The combined `deploy.yml` thin caller then routes `push` events to GitHub Pages and `pull_request` events to Cloudflare Pages via `cloudflare/pages-action`. Preview URLs resolve as `<repo>-pr-<n>.<domain>`.
