---
title: Doppler Plugin
description: Implements the vault capability against Doppler's REST API.
---

`@theholocron/holocron-plugin-doppler` implements the `vault` capability against [Doppler](https://www.doppler.com/)'s REST API — projects, configs, secrets, plus token verification for `holocron auth`.

## Install

```bash
pnpm add -D @theholocron/holocron-plugin-doppler
```

## Capabilities

| Capability | Token required                       |
| ---------- | ------------------------------------ |
| `vault`    | `HOLOCRON_DOPPLER_TOKEN` (`doppler`) |

## Config

```ts
providers: {
  vault: ["doppler", {
    // Required: Doppler project name
    project: "my-project",
    // Required: Doppler config name (e.g. "dev", "stg", "prd")
    config: "prd",
  }],
}
```

### Options

| Option    | Required | Description                     |
| --------- | -------- | ------------------------------- |
| `project` | Yes      | Doppler project name            |
| `config`  | Yes      | Doppler config/environment name |

## Authentication

1. Go to [dashboard.doppler.com](https://dashboard.doppler.com) and open your project
2. Select the config you want to read from (e.g. `prd`)
3. Click **Access** → **Service Tokens** → **Generate Service Token**
4. Copy the token — it starts with `dp.st.`

```bash
holocron auth set doppler dp.st.xxx
```

Or via env var:

```bash
export HOLOCRON_DOPPLER_TOKEN=dp.st.xxx
```

## What `vault` provides

- `read(key)` — reads a single secret by name from the configured project + config
- `write(key, value)` — sets or updates a secret
- `list()` — lists all secret names in the config
- `environments?()` — lists all configs in the project (`"dev"`, `"stg"`, `"prd"`)
- `readEnvironment?(config)` — reads all KEY=VALUE pairs from a config (powers `holocron secrets sync`)
- `ensureProject?(name)` — creates a Doppler project if missing
- `ensureEnvironment?(project, name)` — creates a config (branch) inside a project

## Example: sync Doppler → GitHub + Vercel

```bash
# Pull all secrets from the "production" config →
# → set as GitHub Actions secrets
# → set as Vercel env vars (production + preview)
holocron secrets sync production --project-id prj_vercel_xxx
```
