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

## Usage — Pages

```ts
const cf = createCloudflareClient({ token: process.env.CLOUDFLARE_API_TOKEN! });
const ACCOUNT = process.env.CLOUDFLARE_ACCOUNT_ID!;

// Ensure a Pages project exists
const existing = await cf.pages.getProject(ACCOUNT, "my-docs-preview");

// Create a project
const project = await cf.pages.createProject(ACCOUNT, {
  name: "my-docs-preview",
  production_branch: "main",
});

// Trigger a preview deployment for a branch
const deployment = await cf.pages.createDeployment(ACCOUNT, "my-docs-preview", "feat/my-feature");
console.log(deployment.url); // https://<hash>.my-docs-preview.pages.dev

// Get deployment status
const status = await cf.pages.getDeployment(ACCOUNT, "my-docs-preview", deployment.id);

// Add a custom domain to the project
await cf.pages.addDomain(ACCOUNT, "my-docs-preview", "*.preview.example.dev");

// List custom domains
const domains = await cf.pages.listDomains(ACCOUNT, "my-docs-preview");

// Set an env var on a project
await cf.pages.updateProject(ACCOUNT, "my-docs-preview", {
  deployment_configs: {
    preview: { env_vars: { MY_VAR: { value: "hello", type: "plain_text" } } },
    production: { env_vars: {} },
  },
});
```

## Usage — Workers

```ts
const cf = createCloudflareClient({ token: process.env.CLOUDFLARE_API_TOKEN! });
const ACCOUNT = process.env.CLOUDFLARE_ACCOUNT_ID!;

// Deploy (or update) a Worker script
await cf.workers.putScript(ACCOUNT, "my-worker", "export default { fetch() { … } };");

// Set a secret — one call both stores the encrypted value and binds it as
// `env.MY_SECRET` in the Worker; values are write-only, never echoed back
await cf.workers.putSecret(ACCOUNT, "my-worker", "MY_SECRET", "shh");

// List secret names bound to a script (no values)
const secrets = await cf.workers.listSecrets(ACCOUNT, "my-worker");

// Remove a secret binding
await cf.workers.deleteSecret(ACCOUNT, "my-worker", "MY_SECRET");

// Route management — zone-scoped
const routes = await cf.workers.listRoutes("zone-id");
await cf.workers.createRoute("zone-id", "example.com/*", "my-worker");
await cf.workers.updateRoute("zone-id", routes[0].id, "example.com/*", "my-worker");
```

## Auth

Create an [API Token](https://dash.cloudflare.com/profile/api-tokens) with the permissions your use case requires:

| Use case           | Required permissions             |
| ------------------ | -------------------------------- |
| DNS management     | `Zone:Read`, `DNS:Edit`          |
| Tunnel management  | `Account:Cloudflare Tunnel:Edit` |
| Pages deployments  | `Account:Cloudflare Pages:Edit`  |
| Workers + secrets  | `Account:Workers Scripts:Edit`   |
| Worker routes      | `Zone:Workers Routes:Edit`       |
| Token verification | `User:API Tokens:Read`           |

Pass the token directly or via the `CLOUDFLARE_API_TOKEN` environment variable.
