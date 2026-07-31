---
title: "secret set"
description: Set a single secret via the configured secrets capability.
---

```bash
holocron secret set <name> [value] [--from-stdin] [--from-env <var>] [--scope <scope>] [--dry-run]
```

Sets a single secret at the specified scope using the `secrets` capability (e.g. GitHub Actions secrets). The secret value is read from the positional argument, `--from-stdin`, `--from-env`, or the env var matching `<name>` — in that priority order.

## Arguments and options

| Argument / Option | Default | Description |
| --- | --- | --- |
| `<name>` | *(required)* | Secret name (e.g. `NPM_TOKEN`) |
| `[value]` | — | Secret value as a positional argument |
| `--from-stdin` | `false` | Read secret value from stdin |
| `--from-env <var>` | — | Read from a named env var (falls back to env var matching `<name>`) |
| `--scope` | `repo` | Scope: `repo`, `env=<name>`, or `org=<name>` |
| `--dry-run` | `false` | Print what would be set without writing |

## Scope formats

| Scope | Example | Description |
| --- | --- | --- |
| `repo` | `--scope repo` | Repository-level secret (default) |
| `env=<name>` | `--scope env=production` | Environment-level secret |
| `org=<name>` | `--scope org=my-org` | Organization-level secret |

## Examples

```bash
# From positional value
holocron secret set NPM_TOKEN tok_xxx

# From env var (reads $NPM_TOKEN)
holocron secret set NPM_TOKEN

# From a different env var
holocron secret set DEPLOY_HOOK --from-env VERCEL_HOOK_URL

# From stdin (useful for piping)
echo "tok_xxx" | holocron secret set NPM_TOKEN --from-stdin

# Environment-scoped
holocron secret set DATABASE_URL --scope env=production

# Org-scoped
holocron secret set SHARED_TOKEN --scope org=my-org

# Dry-run
holocron secret set NPM_TOKEN tok_xxx --dry-run
```

## Authentication

Uses `HOLOCRON_ADMIN_TOKEN` / `github.admin` keyring entry when the `secrets` capability is GitHub. Required scopes: `secrets: read/write`, `environments: read/write` (for env-scoped secrets).
