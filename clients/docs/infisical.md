---
title: Infisical Client
description: TypeScript client for the Infisical secrets manager API, built on @theholocron/http-client.
---

`@theholocron/infisical-client` is a typed wrapper around the Infisical API for managing secrets and workspaces.

## Install

```bash
pnpm add @theholocron/infisical-client
```

## Usage

```ts
import { createInfisicalClient } from "@theholocron/infisical-client";

const client = createInfisicalClient({ token: process.env.INFISICAL_TOKEN });

const secrets = await client.secrets.list({
  workspaceId: "ws-123",
  environment: "production",
});

const workspaces = await client.workspaces.list();
```

## Namespaces

| Namespace    | Methods                                      |
| ------------ | -------------------------------------------- |
| `secrets`    | `list`, `get`, `create`, `update`            |
| `workspaces` | `list`, `get`, `create`, `createEnvironment` |
