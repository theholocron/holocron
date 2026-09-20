<!-- editorconfig-checker-disable-file -->

# `@theholocron/holocron-plugin-vercel`

Vercel plugin for [Holocron](../cli). Implements the `deployment`
capability against the [Vercel REST API](https://vercel.com/docs/rest-api).

## Install

<!-- prettier-ignore -->
```bash
pnpm add -D @theholocron/holocron-plugin-vercel@alpha

```

## Auth

Token resolution order:

1. `--token <PAT>` flag on the holocron invocation
2. `HOLOCRON_VERCEL_TOKEN` env var
3. `VERCEL_TOKEN` env var (the default the Vercel CLI also reads)
4. Keyring `vercel.<org>` — tried first when an org is active via `--org`, `HOLOCRON_ORG`, or `org` in `holocron.config.ts`
5. Keyring `vercel` — unnamespaced fallback; set via `holocron auth set vercel <token>`

If none are set, the plugin throws a clear error. No `vercel auth`
fallback — Vercel's CLI auth is per-account and the scopes don't
always cover what holocron needs at the API level. Explicit token only.

## Config

<!-- prettier-ignore -->
```jsonc
// holocron.config.json
{
  "providers": {
    "deployment": ["vercel", { "teamId": "team_xxx" }],
  },
}

```

- `teamId` (optional) — Vercel team id. When set, all requests are
  scoped to that team. Leave unset for personal-account projects.

## Status

**`v2.0.0-alpha.0`** — published on npm under the `alpha` dist-tag.
[Release notes](https://github.com/theholocron/holocron/releases/tag/v2.0.0-alpha.0).
APIs may still shift before stable v2.0.0.

Capability covers:

- `listProjects()` / `ensureProject()` — idempotent project create
- `updateProjectSettings()` — toggle preview deploys, git-creates-deploys
- `setEnvVar()` / `listEnvVars()` — per-target env vars
- `triggerDeployment()` — branch deploys with optional named target
  (requires a project already linked to a Git repo)
- `deployFunction()` — deploy directly from source files, bypassing Git
  entirely: `POST /v13/deployments` with an inline `files` array, no
  linked repo required. For a consumer with no repo to deploy from — a
  webhook receiver shipped as an npm package, for instance. Always
  deploys with `projectSettings.framework: null` (a bare function, not
  an app) — `defaultFramework` only applies to `ensureProject()`'s
  Git-linked path.
- `getDeployment()` — fetch a deployment by id
- `ensureCustomDomain()` — idempotent add (list → add-if-missing →
  check DNS routing). Ownership (`verified`) and DNS routing are
  separate: once a team already owns a domain's apex, every new
  subdomain auto-verifies immediately with no fresh challenge, so
  attachment alone can't tell you whether traffic is actually routed
  to Vercel yet. `domains.config()` answers that regardless of
  ownership state, returning a per-project CNAME target — never a
  fixed well-known host — only when DNS isn't already configured. The
  returned DNS record is handed to the configured `dns` provider by
  `holocron setup`.

Declare the production domain in the Vercel provider options. On `holocron setup`,
the domain is attached to the project and any Vercel verification CNAME is
upserted through the configured DNS provider:

```ts
providers: {
	deployment: ["vercel", { teamId: "team_…", domain: "sentinel.example.com" }],
	dns: "cloudflare",
}
```

Out of scope for alpha.0 (file a follow-up if needed):

- Domain removal (`removeDomain`)
- Deletion (`deleteProject`)
- Marketplace integrations (e.g. `vercel install neon` for vault-managed databases)
