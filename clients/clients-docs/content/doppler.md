---
title: Doppler Client
description: TypeScript client for the Doppler secrets manager API, built on @theholocron/http-client.
---

`@theholocron/doppler-client` is a typed wrapper around the Doppler v3 API for managing projects, environments, and secrets.

## Install

```bash
pnpm add @theholocron/doppler-client
```

## Usage

```ts
import { createDopplerClient } from "@theholocron/doppler-client";

const client = createDopplerClient({ token: process.env.DOPPLER_TOKEN });

const secrets = await client.secrets.list({
  project: "my-project",
  config: "production",
});
const me = await client.me.get();
```

## Namespaces

| Namespace      | Methods                             |
| -------------- | ----------------------------------- |
| `environments` | `list`, `create`                    |
| `me`           | `get`                               |
| `projects`     | `create`                            |
| `secrets`      | `get`, `list`, `update`, `download` |
