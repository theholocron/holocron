---
title: Holocron
description: A pluggable, capability-based CLI for spinning up and operating software projects.
sidebar:
  hidden: true
---

Holocron is a pluggable CLI that orchestrates infrastructure and repository operations through a capability system. Each capability (source control, secrets, deployments, etc.) is fulfilled by a plugin — configure which providers you use once in `holocron.config.ts`, then drive your entire project lifecycle through a single tool.

## Packages

| Package                                                              | Description                                        |
| -------------------------------------------------------------------- | -------------------------------------------------- |
| [`@theholocron/cli`](https://www.npmjs.com/package/@theholocron/cli) | The CLI itself — install globally or via pnpm exec |
| [`@theholocron/holocron-plugin-github`](./plugins/github)            | source, ci, secrets, environments, issues          |
| [`@theholocron/holocron-plugin-vercel`](./plugins/vercel)            | deployment                                         |
| [`@theholocron/holocron-plugin-1password`](./plugins/1password)      | vault                                              |
| [`@theholocron/holocron-plugin-cloudflare`](./plugins/cloudflare)    | dns                                                |
| [`@theholocron/holocron-plugin-clerk`](./plugins/clerk)              | auth                                               |
| [`@theholocron/holocron-plugin-discord`](./plugins/discord)          | notifications                                      |
| [`@theholocron/holocron-plugin-doppler`](./plugins/doppler)          | vault                                              |
| [`@theholocron/holocron-plugin-infisical`](./plugins/infisical)      | vault                                              |
| [`@theholocron/holocron-plugin-neon`](./plugins/neon)                | storage                                            |
| [`@theholocron/holocron-plugin-posthog`](./plugins/posthog)          | analytics                                          |
| [`@theholocron/holocron-plugin-postman`](./plugins/postman)          | tooling                                            |
| [`@theholocron/holocron-plugin-sentry`](./plugins/sentry)            | observability                                      |
| [`@theholocron/holocron-plugin-slack`](./plugins/slack)              | notifications                                      |

## Install

```bash
npm i -g @theholocron/cli
# or per-project:
pnpm add -D @theholocron/cli
```

## Quick example

```bash
# Authenticate once
holocron auth set github.admin  ghp_xxx
holocron auth set github.read   ghp_yyy

# Apply full repo setup
holocron setup

# Sync repo metadata to GitHub
holocron sync

# Check all providers are reachable
holocron doctor
```

See [Getting Started](./getting-started) for the full walkthrough.
