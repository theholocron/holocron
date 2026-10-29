---
title: Cloudflare Client
description: TypeScript client for the Cloudflare API — manage zones, DNS, tunnels, and tokens.
---

`@theholocron/cloudflare-client` wraps the Cloudflare REST API for managing zones, DNS records, tunnels, and token verification.

## Install

```bash
pnpm add @theholocron/cloudflare-client
```

## Usage

```ts
import { createCloudflareClient } from "@theholocron/cloudflare-client";

const client = createCloudflareClient({
  token: process.env.CLOUDFLARE_API_TOKEN!,
});

const zones = await client.zones.list();
const records = await client.dns.list(zones[0].id);
await client.dns.create(zones[0].id, { type: "A", name: "api", content: "1.2.3.4", ttl: 1 });

const tunnels = await client.tunnels.list(zones[0].id);
const verified = await client.tokens.verify();
```

## Exports

| Export                    | Description                                                                       |
| ------------------------- | --------------------------------------------------------------------------------- |
| `createCloudflareClient`  | Factory returning a client with `dns`, `tokens`, `tunnels`, and `zones` resources |
| `CloudflareClientOptions` | Options type for `createCloudflareClient`                                         |
| `CfZone`                  | Shape of a Cloudflare zone                                                        |
| `CfDnsRecord`             | Shape of a DNS record                                                             |
| `CfDnsRecordInput`        | Input for `dns.create()`                                                          |
| `CfDnsRecordType`         | Union of valid DNS record types                                                   |
| `CfTunnel`                | Shape of a Cloudflare tunnel                                                      |
| `CfTunnelConfig`          | Tunnel configuration shape                                                        |
| `CfIngressRule`           | Ingress rule within a tunnel config                                               |
| `CfTokenVerification`     | Shape of the token verification response                                          |
| `CfEnvelope`              | Generic Cloudflare API response envelope                                          |
| `CloudflareClient`        | Return type of `createCloudflareClient`                                           |
