# `@theholocron/neon-client`

TypeScript client for the [Neon API](https://api-docs.neon.tech/reference/getting-started-with-neon-api).

## Install

```bash
pnpm add @theholocron/neon-client
```

## Usage

```ts
import { createNeonClient } from "@theholocron/neon-client";

const neon = createNeonClient({ token: process.env.NEON_API_KEY! });

// Verify token
const me = await neon.users.me();

// List branches in a project
const { branches } = await neon.branches.list("my-project-id");

// Create a branch with a read/write endpoint
const { branch } = await neon.branches.create("my-project-id", {
  name: "feat/my-feature",
  parent_id: "br_main",
  endpoints: [{ type: "read_write" }],
});

// Get a connection URI
const { uri } = await neon.connection.uri("my-project-id", {
  branch_id: branch.id,
  database_name: "neondb",
  role_name: "neondb_owner",
});

// List databases on a branch
const { databases } = await neon.databases.list("my-project-id", branch.id);

// Run SQL against a branch database
await neon.databases.runSql(
  "my-project-id",
  branch.id,
  "neondb",
  'CREATE EXTENSION IF NOT EXISTS "pgvector"',
);

// Restore a branch to another branch's state
await neon.branches.restore("my-project-id", branch.id, "br_main");

// Delete a branch
await neon.branches.destroy("my-project-id", branch.id);
```

## Status

`v0.11.3` — published on npm. APIs may shift before v1.
