# `@theholocron/holocron-plugin-vercel`

Vercel plugin for [Holocron](../cli). Implements the `deployment`
capability against the [Vercel REST API](https://vercel.com/docs/rest-api).

## Auth

Token resolution order:

1. `--token <PAT>` flag on the holocron invocation
2. `HOLOCRON_VERCEL_TOKEN` env var
3. `VERCEL_TOKEN` env var (the default the Vercel CLI also reads)

If none are set, the plugin throws a clear error. No `vercel auth`
fallback — Vercel's CLI auth is per-account and the scopes don't
always cover what holocron needs at the API level. Explicit token only.

## Config

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

**v0.0.0 — first port.** Capability covers:

- `listProjects()` / `ensureProject()` — idempotent project create
- `updateProjectSettings()` — toggle preview deploys, git-creates-deploys
- `setEnvVar()` / `listEnvVars()` — per-target env vars
- `triggerDeployment()` — branch deploys with optional named target
- `getDeployment()` — fetch a deployment by id

Out of scope for v1 (file a follow-up if needed):

- Domain management (`addDomain` / `removeDomain`)
- Deletion (`deleteProject`)
- Marketplace integrations (e.g. `vercel install neon` for vault-managed databases)
