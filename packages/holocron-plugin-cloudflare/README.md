<!-- editorconfig-checker-disable-file -->

# `@theholocron/holocron-plugin-cloudflare`

Cloudflare plugin for [Holocron](../cli). Implements the `dns`
capability against the [Cloudflare v4 API](https://developers.cloudflare.com/api/).

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

Generate a scoped API token at **dash.cloudflare.com/profile/api-tokens**
with `Zone:Read` and `DNS:Edit` permissions.

## Config

<!-- prettier-ignore -->
```jsonc
{
  "providers": {
    "dns": ["cloudflare", { "accountId": "optional-account-id" }],
  },
}

```

- `accountId` (optional) — Cloudflare account id. Not required for DNS
  operations; needed only if you extend the plugin to tunnel management.

## What's implemented

| Method         | What it does                                                                                                                                                                                                                        |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `listRecords`  | Lists all DNS records in the zone that contains the given domain. Resolves the zone by walking label-by-label from the full domain to the apex.                                                                                     |
| `upsertRecord` | Creates a record if none matching `type + name` exists; patches the first match otherwise. When multiple same-type records exist, only the first is updated — use explicit list/delete/create for multi-TXT scenarios (SPF + DKIM). |
| `deleteRecord` | Deletes a record by id within the zone that contains the given domain.                                                                                                                                                              |

Zone ids are cached per plugin instance for the lifetime of the process.
