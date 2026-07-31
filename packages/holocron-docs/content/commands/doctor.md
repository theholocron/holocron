---
title: "doctor"
description: Load every configured capability and run a smoke check against each provider.
---

```bash
holocron doctor [--repo owner/name] [--dry-run]
```

`doctor` loads the config, instantiates every capability, and runs a lightweight probe against each provider. Use it to confirm authentication and connectivity before running `setup` or after rotating a token.

## What each capability checks

| Capability | Smoke check |
| --- | --- |
| `source` | `whoami()` — verifies the token and returns the authenticated login |
| `issues` | `doctor()` — validates lifecycle slot mapping and lists available statuses |
| `secrets` | `listSecrets({ kind: 'repo' })` — lists secret names at repo scope |
| `ci` | `listRuns({ limit: 1 })` — fetches the most recent CI run |
| `vault` | `list()` — lists available secret keys |
| `auth` | `whoami()` — verifies the auth provider key |
| Others | "loaded" — confirms the plugin loads without error |

## Output

```
Holocron doctor — my-project
  config: /path/to/holocron.config.ts

  source    github    ✓  authenticated as cnewton
  ci        github    ✓  1 run found
  secrets   github    ✓  3 secrets
  issues    github    ✓  authenticated as cnewton / Repo: my-org/my-project
  vault     doppler   ✓  12 secrets

Summary: 5 ok, 0 fail, 0 skip
```

Exit code is 1 if any capability reports `fail`.

## Options

| Option | Description |
| --- | --- |
| `--repo owner/name` | Override the repo coordinate (defaults to config or git remote) |
| `--dry-run` | No-op for doctor — read-only checks still run |
