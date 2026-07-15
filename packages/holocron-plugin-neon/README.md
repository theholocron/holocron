<!-- editorconfig-checker-disable-file -->

# `@theholocron/holocron-plugin-neon`

Neon plugin for [Holocron](../cli). Implements the `storage`
capability against [Neon's REST API](https://api-docs.neon.tech/reference/getting-started-with-neon-api).

## Install

<!-- prettier-ignore -->
```bash
pnpm add -D @theholocron/holocron-plugin-neon@alpha
<!-- prettier-ignore -->
```

## Auth

Token resolution order:

1. `--token <PAT>` flag on the holocron invocation
2. `HOLOCRON_NEON_API_KEY` env var
3. `NEON_API_KEY` env var (the default Neon's own CLI reads)

## Config

<!-- prettier-ignore -->
```jsonc
{
  "providers": {
    "storage": ["neon", { "projectId": "ancient-resonance-…" }],
  },
}
<!-- prettier-ignore -->
```

- `projectId` (required) — the Neon project id. The plugin binds to
  this project; every method operates within it.

## What's implemented

| Method                | What it does                                                                                                                                    |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `getConnectionString` | Fetches the connection URI for a branch. `pooled: true` returns the PgBouncer URL.                                                              |
| `listBranches`        | All branches on the bound project.                                                                                                              |
| `createBranch`        | Provisions a branch + a read_write compute endpoint inline (so the next connection-string call doesn't 404).                                    |
| `destroyBranch`       | DELETEs a branch.                                                                                                                               |
| `resetBranch`         | Restores one branch to match another (Neon "restore branch" endpoint).                                                                          |
| `enableExtension`     | Runs `CREATE EXTENSION IF NOT EXISTS "..."` against the branch's default database via Neon's run_sql endpoint. Used for PostGIS, pgvector, etc. |

Vercel-managed Neon orgs reject project-create at the Neon API level
("organization is managed by Vercel"). For those setups, provision
the project via Vercel's marketplace integration (`vercel install
neon`) — the project becomes visible to Neon's API afterward and
holocron can take it from there. Marketplace provisioning is out of
scope for this plugin (covered by `holocron-plugin-vercel` if needed
later).

## Status

**`v2.0.0-alpha.0`** — published on npm under the `alpha` dist-tag.
[Release notes](https://github.com/theholocron/holocron/releases/tag/v2.0.0-alpha.0).
APIs may still shift before stable v2.0.0.
