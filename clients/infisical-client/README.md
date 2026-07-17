# `@theholocron/infisical-client`

TypeScript client for the [Infisical API](https://infisical.com/docs/api-reference/overview/introduction).

## Install

```bash
pnpm add @theholocron/infisical-client
```

## Usage

```ts
import { createInfisicalClient } from "@theholocron/infisical-client";

const infisical = createInfisicalClient({
  token: process.env.INFISICAL_TOKEN!,
});

// List workspaces
const { workspaces } = await infisical.workspaces.list();

// Get workspace details (including environments)
const { workspace } = await infisical.workspaces.get("workspace-id");

// Create a project
await infisical.workspaces.create("my-project", "my-project");

// Create an environment in a workspace
await infisical.workspaces.createEnvironment("workspace-id", "Staging", "stg");

// List secrets
const { secrets } = await infisical.secrets.list({
  workspaceId: "workspace-id",
  environment: "dev",
});

// Read a secret
const { secret } = await infisical.secrets.get("DB_URL", {
  workspaceId: "workspace-id",
  environment: "dev",
});

// Create a secret
await infisical.secrets.create("DB_URL", {
  workspaceId: "workspace-id",
  environment: "dev",
  secretValue: "postgres://...",
});

// Update a secret
await infisical.secrets.update("DB_URL", {
  workspaceId: "workspace-id",
  environment: "dev",
  secretValue: "postgres://new-host/db",
});
```

## Status

`v0.7.0` — published on npm. APIs may shift before v1.
