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

// Create a deploy — static files (plain text) and/or functions (pre-built
// zips). This is the digest-based flow: real, invokable functions — not
// the single-whole-zip method, which only deploys static assets.
import { buildZip } from "@theholocron/netlify-client";

const functionZip = buildZip({
  "webhook.mjs": "exports.handler = async () => ({ statusCode: 200, body: 'ok' });",
});
const deploy = await netlify.deploys.create("site-id", {
  files: { "index.html": "<!doctype html><title>status</title>" },
  functions: [{ name: "webhook", zip: functionZip }],
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

- **Functions need the digest flow — the single-zip method doesn't deploy
  functions at all.** Confirmed live: a function file placed inside a
  single whole-site zip (`POST .../deploys` with `Content-Type:
application/zip`) is served as an inert static asset, never wired up
  as a Lambda. `deploys.create()`'s `functions` field uses the real flow
  (SHA1 file manifest + SHA256 function manifest, then
  `PUT .../functions/{name}?runtime=js`) — this is the only way to ship
  an actually-invokable function through this API.
- **A function's zip entry file basename must exactly match the function
  name.** Confirmed live: naming the function `webhook` but the zip's
  entry file `handler.mjs` fails at invoke time with
  `Runtime.ImportModuleError: Cannot find module 'webhook'`. No nested
  paths either (unlike Vercel's `api/webhook.mjs`) — the file needs to
  sit at the zip root as `<name>.mjs` (or `.js`).
- **`runtime: "js"` expects a classic CommonJS/Lambda handler, not the
  modern `(Request) => Response` style.** Confirmed live: `export default
(req) => new Response(...)` deploys without error but fails at invoke
  time with `Runtime.HandlerNotFound: <name>.handler is undefined or not
exported`. Use `exports.handler = async (event, context) => ({
statusCode, headers, body })` (or the ESM equivalent, `export const
handler = ...`) instead.
- **No build step on a function upload.** Netlify runs no `npm install`
  or configured build command for a raw API-uploaded function, unlike a
  Git-linked deploy (or `netlify deploy` run locally via the CLI). If the
  function imports anything beyond Node builtins, its `zip` needs a real
  `node_modules` included — resolve dependencies into the zip yourself
  before calling `create()`.
- **Sites are account-slug-scoped to create, account-id-scoped for env
  vars.** Netlify's own API is inconsistent here — `POST /{account_slug}/sites`
  but `GET/POST/PUT /accounts/{account_id}/env`. Not something this client
  can paper over; pass whichever one each method asks for. The slug is
  also mutable (an account/team can rename it in settings) — don't treat
  a previously-observed slug as permanent.
- **`state` on a deploy is a free-form string**, not a published enum.
  Known values seen in practice: `new`, `building`, `uploading`,
  `uploaded`, `preparing`, `prepared`, `processing`, `ready`, `error`,
  `retrying`, `current`.
