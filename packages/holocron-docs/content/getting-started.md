---
title: Getting Started
description: Install the Holocron CLI, create your config, and run your first setup.
---

## Install

Install the CLI globally or as a project dev dependency:

```bash
# global
npm i -g @theholocron/cli

# per-project (pnpm exec holocron ...)
pnpm add -D @theholocron/cli
```

Install the plugins you need alongside it:

```bash
pnpm add -D @theholocron/holocron-plugin-github @theholocron/holocron-plugin-vercel
```

## Create your config

Create `holocron.config.ts` (or `.json`) in your repo root:

```ts
import { defineConfig } from "@theholocron/holocron-config";

export default defineConfig({
  name: "my-project",
  description: "Short project description",
  homepage: "https://github.com/my-org/my-project",
  repo: {
    name: "my-org/my-project",
    protection: "balanced",
    topics: ["typescript", "node"],
    properties: {
      lifecycle: "active",
      runtime_environment: "node",
    },
  },
  workflows: ["lint", "test", "typecheck", "release"],
  skills: ["git-safety", "pr-workflow", "commit-standards"],
  agent: "claude",
  providers: {
    source: "github",
    ci: "github",
    secrets: "github",
    environments: "github",
  },
});
```

## Authenticate

Store provider tokens in the OS keyring so every command picks them up automatically:

```bash
holocron auth set github.admin  ghp_xxx  # repo setup, secrets
holocron auth set github.read   ghp_yyy  # clone, CI run listing
holocron auth set github.issues ghp_zzz  # issue management
holocron auth set github.sync   ghp_aaa  # sync-github
```

See the [Token Reference](./tokens) for the full list of tokens and the scopes each needs.

## Verify everything is reachable

```bash
holocron doctor
```

This loads every configured plugin and runs a smoke check against each provider. Fix any `fail` rows before continuing.

## Run setup

```bash
holocron setup
```

`setup` applies all infrastructure actions for the configured capabilities:
- Writes `.editorconfig`, `.alexrc.json`, `codecov.yml`, and `commitlint.config.ts`
- Installs CI workflow thin callers from `workflows[]`
- Configures branch protection (from `repo.protection`)
- Syncs labels, repo settings, teams, security features (GitHub plugin)
- Installs agent skills (from `skills[]`)

Add `--dry-run` to see what would happen without making any changes.

## Keep repo metadata in sync

After updating `holocron.config.ts`:

```bash
holocron sync
```

This syncs labels, custom properties, topics, teams, the repo description, and the homepage URL to GitHub.
