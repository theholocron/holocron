# `@theholocron/doppler-client`

TypeScript client for the [Doppler API](https://docs.doppler.com/reference/api).

## Install

```bash
pnpm add @theholocron/doppler-client
```

## Usage

```ts
import { createDopplerClient } from "@theholocron/doppler-client";

const doppler = createDopplerClient({ token: process.env.DOPPLER_TOKEN! });

// Verify token
const identity = await doppler.me.get();

// List secret names in a config
const { secrets } = await doppler.secrets.list("my-project", "dev");

// Read a single secret
const secret = await doppler.secrets.get("my-project", "dev", "DB_URL");

// Write secrets
await doppler.secrets.update("my-project", "dev", { API_KEY: "new-value" });

// Download all secrets as a flat map
const env = await doppler.secrets.download("my-project", "dev");

// List environments in a project
const { environments } = await doppler.environments.list("my-project");

// Create a project
await doppler.projects.create("my-project", "Managed by holocron");

// Create an environment
await doppler.environments.create("my-project", "Staging", "stg");
```

## Status

`v0.5.0` — published on npm. APIs may shift before v1.
