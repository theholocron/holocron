<!-- editorconfig-checker-disable-file -->

# `@theholocron/holocron-plugin-netlify`

Netlify plugin for [Holocron](../cli). Implements the
`deployment` capability against [`@theholocron/netlify-client`](https://github.com/theholocron/clients/tree/main/packages/netlify-client),
plus exports `verifyToken` + `AUTH_HINT` for use by `holocron auth`.

## Install

```bash
pnpm add -D @theholocron/holocron-plugin-netlify@alpha
```

## Auth

Token resolution order (matches the standard 4-step precedence set by
`docs/wiki/specifications/tech-auth-bootstrap.spec.md`):

1. `--token <TOKEN>` flag on the holocron invocation
2. `HOLOCRON_NETLIFY_TOKEN` env var (preferred — explicit intent)
3. `NETLIFY_AUTH_TOKEN` env var (Netlify-native)
4. **Keyring** — `com.theholocron.cli` service, account `netlify`
5. `AuthError` naming all four options + the bootstrap hint

## Setup

```bash
# Generate a Netlify API token (see vendor docs), then:
holocron auth set netlify <TOKEN>
holocron auth check netlify    # verify
```

## Config

```jsonc
{
  "providers": {
    "deployment": "netlify",
  },
}
```

Plugin options, via the tuple form:

```jsonc
{
  "providers": {
    "deployment": [
      "netlify",
      {
        // Required for ensureProject/listProjects — Netlify's
        // create-site endpoint is scoped to /{account_slug}/sites.
        "accountSlug": "iamnewton",
        // Required for listEnvVars/setEnvVar — Netlify's env var API
        // is scoped to /accounts/{account_id}/env, by id not slug.
        // Non-secret identifier, safe to commit (same status as
        // Vercel's teamId / Cloudflare's accountId elsewhere in this org).
        "accountId": "6ac41cd9a87355ef3d13d261",
        // Custom domain `holocron setup` attaches to the site.
        "domain": "sentinel.theholocron.dev",
      },
    ],
  },
}
```

## What's implemented

Thin wrapper over `@theholocron/netlify-client`'s `sites` / `deploys` /
`env` / `user` resources — see that package for the actual REST calls.
Verified against Netlify's real API, not just mocks: a live smoke test
(create a site, deploy real content via the client's in-memory zip
builder, poll to `ready`, fetch the live URL) using this plugin's own
built `createPlugin()` output.

- `listProjects` / `ensureProject` → `sites.list` / `sites.create`
- `deployFunction` → `deploys.createFromZip` — Netlify runs no build
  step for a raw zip upload, so the caller (Sentinel's own stage-deploy
  script) is responsible for already having resolved dependencies into
  the file set, the same discipline Vercel's `deployFunction` path
  requires via its own trimmed/pinned `package.json`.
- `getDeployment` → `deploys.get`
- `listEnvVars` / `setEnvVar` → `env.list` / `env.set`
- `ensureCustomDomain` → `sites.update({ custom_domain })`; returns a
  CNAME record unconditionally (Netlify has no DNS-misconfiguration
  check to consult the way Vercel does, so idempotency relies on
  `Dns.upsertRecord()` being a safe no-op on an already-correct record)

Required by the `Deployment` interface but **not exercised by any
current consumer** (best-effort, see inline comments in
`src/capabilities/deployment.ts`):

- `updateProjectSettings` — Netlify has no direct equivalent of Vercel's
  git-linked-project settings; no-ops to `sites.get`.
- `triggerDeployment` → `sites.triggerBuild`, untested against a real
  git-linked Netlify site.

Not implemented: `listPreviewDeployments` / `deletePreviewDeployments`
(both optional on the interface) — no current consumer needs
branch-preview listing/cleanup.

## Status

Implemented for Sentinel's migration off Vercel
(`.notes/tech-sentinel-deploy-target-netlify.spec.md`, holocron#940).
