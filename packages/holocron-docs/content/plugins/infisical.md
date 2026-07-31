---
title: Infisical Plugin
description: Implements the vault capability against Infisical's REST API.
---

`@theholocron/holocron-plugin-infisical` implements the `vault` capability against [Infisical](https://infisical.com/)'s REST API, including Universal Auth for machine-to-machine token generation.

## Install

```bash
pnpm add -D @theholocron/holocron-plugin-infisical
```

## Capabilities

| Capability | Token required                           |
| ---------- | ---------------------------------------- |
| `vault`    | `HOLOCRON_INFISICAL_TOKEN` (`infisical`) |

## Config

```ts
providers: {
  vault: ["infisical", {
    // Required: Infisical project/workspace id
    projectId: "abc123",
    // Required: Environment slug
    environment: "prod",
    // Optional: Secret path (default: "/")
    path: "/",
  }],
}
```

### Options

| Option        | Required | Description                               |
| ------------- | -------- | ----------------------------------------- |
| `projectId`   | Yes      | Infisical workspace/project id            |
| `environment` | Yes      | Environment slug (e.g. `"prod"`, `"dev"`) |
| `path`        | No       | Secret folder path (default: `"/"`)       |

## Authentication

```bash
holocron auth set infisical <universal-auth-client-secret>
```

Or via env var:

```bash
export HOLOCRON_INFISICAL_TOKEN=<client-secret>
```

The plugin uses Infisical Universal Auth (machine identity) to exchange the client secret for an access token on each call. Create a machine identity in the Infisical dashboard and copy its client secret.

## What `vault` provides

- `read(key)` — reads a single secret from the configured project + environment + path
- `write(key, value)` — creates or updates a secret
- `list()` — lists all secret keys in the configured path
- `readEnvironment?(environment)` — reads all KEY=VALUE pairs from an environment (powers `holocron secrets sync`)
