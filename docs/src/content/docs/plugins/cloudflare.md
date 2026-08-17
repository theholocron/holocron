---
title: Cloudflare Plugin
description: Implements the dns capability against Cloudflare's API.
---

`@theholocron/holocron-plugin-cloudflare` implements the `dns` capability using Cloudflare's API. It handles DNS record management across zones, with automatic zone resolution from domain names.

## Install

```bash
pnpm add -D @theholocron/holocron-plugin-cloudflare
```

## Capabilities

| Capability | Token required                             |
| ---------- | ------------------------------------------ |
| `dns`      | `HOLOCRON_CLOUDFLARE_TOKEN` (`cloudflare`) |

## Config

```ts
providers: {
  dns: "cloudflare",
}
```

Or with options:

```ts
providers: {
  dns: ["cloudflare", {
    // Required for account-scoped endpoints (tunnels, custom nameservers)
    accountId: "abc123",
  }],
}
```

### Options

| Option      | Required | Description                                                                                     |
| ----------- | -------- | ----------------------------------------------------------------------------------------------- |
| `accountId` | No       | Cloudflare account ID. Required only for account-scoped endpoints (tunnels, custom nameservers) |

## Authentication

```bash
holocron auth set cloudflare <TOKEN>
```

Or via env var:

```bash
export HOLOCRON_CLOUDFLARE_TOKEN=<TOKEN>
# Also recognized:
export CLOUDFLARE_API_TOKEN=<TOKEN>
```

Create an API token at Cloudflare dashboard → Profile → API Tokens with **Zone:Read** and **DNS:Edit** permissions.

## What `dns` provides

- `listRecords(domain)` — list all DNS records for the zone (zone resolved automatically from domain)
- `upsertRecord(domain, record)` — create or update a DNS record by type and name
- `deleteRecord(domain, id)` — delete a DNS record by id

Zone resolution walks from the full domain up to the apex automatically — e.g. `api.staging.example.com` tries `api.staging.example.com`, then `staging.example.com`, then `example.com`.

## Example

```ts
import { createPlugin } from "@theholocron/holocron-plugin-cloudflare";

const plugin = createPlugin({ token: process.env.HOLOCRON_CLOUDFLARE_TOKEN });
const dns = plugin.capabilities.dns();

await dns.upsertRecord("example.com", {
  type: "TXT",
  name: "_acme-challenge.example.com",
  content: "verification-token",
  ttl: 60,
});
```
