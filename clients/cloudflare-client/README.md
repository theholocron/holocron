# `@theholocron/cloudflare-client`

TypeScript client for the [Cloudflare v4 API](https://developers.cloudflare.com/api/).

## Install

```bash
pnpm add @theholocron/cloudflare-client
```

## Usage

```ts
import { createCloudflareClient } from "@theholocron/cloudflare-client";

const cf = createCloudflareClient({ token: process.env.CLOUDFLARE_API_TOKEN! });

// Verify token
const verification = await cf.tokens.verify();

// Look up a zone by domain name
const zones = await cf.zones.list({ name: "example.com" });
const zoneId = zones[0].id;

// List DNS records in a zone
const records = await cf.dns.list(zoneId);

// Create a DNS record
const record = await cf.dns.create(zoneId, {
  type: "CNAME",
  name: "www",
  content: "cname.vercel-dns.com",
  ttl: 1,
  proxied: false,
});

// Update a DNS record
await cf.dns.update(zoneId, record.id, { content: "new.target.com" });

// Delete a DNS record
await cf.dns.delete(zoneId, record.id);

// Create a Cloudflare Tunnel
const tunnel = await cf.tunnels.create("my-account-id", { name: "my-tunnel" });

// Get the tunnel connector token
const tunnelToken = await cf.tunnels.token("my-account-id", tunnel.id);

// Read/write tunnel ingress configuration
const { config } = await cf.tunnels.getConfig("my-account-id", tunnel.id);
await cf.tunnels.putConfig("my-account-id", tunnel.id, {
  ingress: [{ hostname: "app.example.com", service: "http://localhost:3000" }, { service: "http_status:404" }],
});

// Delete a tunnel (cascade removes all associated routes and DNS records)
await cf.tunnels.delete("my-account-id", tunnel.id);
```

## Auth

Create an [API Token](https://dash.cloudflare.com/profile/api-tokens) with the permissions your use case requires:

| Use case           | Required permissions             |
| ------------------ | -------------------------------- |
| DNS management     | `Zone:Read`, `DNS:Edit`          |
| Tunnel management  | `Account:Cloudflare Tunnel:Edit` |
| Token verification | `User:API Tokens:Read`           |

Pass the token directly or via the `CLOUDFLARE_API_TOKEN` environment variable.
