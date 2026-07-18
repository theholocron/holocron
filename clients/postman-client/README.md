# `@theholocron/postman-client`

TypeScript client for the [Postman API](https://www.postman.com/postman/postman-public-workspace/documentation/8kv5pif/postman-api).

## Install

```bash
pnpm add @theholocron/postman-client
```

## Usage

```ts
import { createPostmanClient } from "@theholocron/postman-client";

const postman = createPostmanClient({ token: process.env.POSTMAN_API_KEY! });

// Get the authenticated user
const { user } = await postman.me.get();

// List workspaces
const { workspaces } = await postman.workspaces.list();

// List collections in a workspace
const { collections } = await postman.collections.list("workspace-id");

// Delete a collection
await postman.collections.delete("collection-uid");

// Import an OpenAPI spec as a collection
const { collections: imported } = await postman.import.openapi(
  "workspace-id",
  spec,
);

// List environments
const { environments } = await postman.environments.list("workspace-id");

// Create an environment
await postman.environments.create("workspace-id", {
  name: "Production",
  values: [],
});

// Update an environment
await postman.environments.update("environment-uid", {
  name: "Production",
  values: [],
});

// List Spec Hub specs
const { specs } = await postman.specs.list("workspace-id");

// Create a spec
await postman.specs.create("workspace-id", {
  name: "My API",
  fileContent: JSON.stringify(openApiSpec),
});

// Update a spec file
await postman.specs.updateFile(
  "spec-id",
  "index.json",
  JSON.stringify(updatedSpec),
);
```

## Status

`v0.8.0` — published on npm. APIs may shift before v1.
