---
title: "upgrade"
description: Upgrade toolchain version pins across the repo.
---

The `upgrade` subcommand group contains commands for updating version pins across a repo.

## `upgrade node <to>`

```bash
holocron upgrade node <to> [--from <major>] [--dry-run]
```

Scans the entire repo tree and updates every Node.js version pin to a new major version. Handles all the places a Node version appears:

| File                          | What gets updated                                |
| ----------------------------- | ------------------------------------------------ |
| `package.json`                | `engines.node` field (`>=20.0.0` → `>=22.0.0`)   |
| `package.json`                | `@types/node` dependency (`^20.0.0` → `^22.0.0`) |
| `.nvmrc`                      | Version string                                   |
| `.node-version`               | Version string                                   |
| GitHub Actions YAML (`*.yml`) | `node-version:` values                           |
| `Dockerfile`                  | `FROM node:<version>` lines                      |

Directories `node_modules`, `.git`, `dist`, `coverage`, `build`, `.turbo`, `.next`, and `out` are skipped.

### Options

| Option      | Default           | Description                                                                          |
| ----------- | ----------------- | ------------------------------------------------------------------------------------ |
| `<to>`      | _(required)_      | Target Node.js major (e.g. `22`)                                                     |
| `--from`    | _(auto-detected)_ | Current major to replace. Auto-detected from `.nvmrc` or `engines.node` when omitted |
| `--dry-run` | `false`           | Print which files would change without writing them                                  |

### Extra paths

Additional file patterns to patch can be registered in `holocron.config.json`:

```json
{
	"upgrade": {
		"node": {
			"extra": ["infra/k8s/deployment.yaml", "scripts/ci-build.sh"]
		}
	}
}
```

### Example

```bash
# Upgrade from auto-detected current version to Node 22
holocron upgrade node 22

# Explicit from/to
holocron upgrade node 22 --from 20

# Preview changes
holocron upgrade node 22 --dry-run
```
