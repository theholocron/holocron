# `@theholocron/netlify-client`

TypeScript client for the [Netlify API](https://docs.netlify.com/api/get-started/).

## Install

```bash
pnpm add @theholocron/netlify-client
```

## Usage

```ts
import { createNetlifyClient } from "@theholocron/netlify-client";

const netlify = createNetlifyClient({
  token: process.env.NETLIFY_AUTH_TOKEN!,
});

// List sites
const sites = await netlify.sites.list();

// Get a site by id
const site = await netlify.sites.get("site-id");

// Create a site — scoped to /{account_slug}/sites, not account id
const created = await netlify.sites.create("my-team-slug", { name: "my-site" });

// Patch a site (e.g. attach a custom domain)
await netlify.sites.update("site-id", { custom_domain: "example.com" });

// Trigger a build from a git-linked site's default branch
const { deploy_id } = await netlify.sites.triggerBuild("site-id");

// Create a deployment directly from source files — zipped in-memory, no
// dependency. Netlify runs no build step for a raw zip upload, unlike a
// Git-linked deploy — resolve dependencies into the file set yourself first.
const deploy = await netlify.deploys.createFromZip("site-id", {
  "api/webhook.mjs": "export default () => new Response('ok');",
  "package.json": '{"name":"fn"}',
});

// Get a deploy by id
const status = await netlify.deploys.get(deploy.id);

// List account-scoped env vars for a site
const vars = await netlify.env.list("account-id", "site-id");

// Set (upsert) one value for one context on a key — Netlify's PUT /env/{key}
// replaces the entire values array, so this reads the current list first
await netlify.env.set("account-id", "site-id", "API_URL", "production", "https://api.example.com");
```

## Notes

- **No build step on a raw zip upload.** `deploys.createFromZip()` deploys
  exactly the file tree you give it — Netlify doesn't run `npm install` or
  any configured build command the way a Git-linked deploy (or `netlify
deploy` run locally via the CLI) does. If your files need dependencies
  installed, resolve them into the file set before calling this.
- **Sites are account-slug-scoped to create, account-id-scoped for env
  vars.** Netlify's own API is inconsistent here — `POST /{account_slug}/sites`
  but `GET/POST/PUT /accounts/{account_id}/env`. Not something this client
  can paper over; pass whichever one each method asks for.
- **`state` on a deploy is a free-form string**, not a published enum.
  Known values seen in practice: `new`, `building`, `uploading`,
  `uploaded`, `preparing`, `prepared`, `processing`, `ready`, `error`,
  `retrying`, `current`.
