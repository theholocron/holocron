---
title: Neon Client
description: TypeScript client for the Neon serverless Postgres API, built on @theholocron/http-client.
---

`@theholocron/neon-client` is a typed wrapper around the Neon API for managing Postgres branches, databases, and connection URIs.

## Install

```bash
pnpm add @theholocron/neon-client
```

## Usage

```ts
import { createNeonClient } from "@theholocron/neon-client";

const client = createNeonClient({ token: process.env.NEON_API_KEY });

const branches = await client.branches.list("project-id");
const branch = await client.branches.create("project-id", {
  name: "feature/my-branch",
});
const uri = await client.connection.uri({
  projectId: "project-id",
  branchId: branch.id,
});
```

## Namespaces

| Namespace    | Methods                                |
| ------------ | -------------------------------------- |
| `branches`   | `list`, `create`, `destroy`, `restore` |
| `connection` | `uri`                                  |
| `databases`  | `list`, `runSql`                       |
| `users`      | `me`                                   |
