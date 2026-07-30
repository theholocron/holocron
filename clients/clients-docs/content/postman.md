---
title: Postman Client
description: TypeScript client for the Postman API, built on @theholocron/http-client.
---

`@theholocron/postman-client` is a typed wrapper around the Postman API for managing collections, environments, workspaces, and API specs.

## Install

```bash
npm i @theholocron/postman-client
```

## Usage

```ts
import { createPostmanClient } from "@theholocron/postman-client";

const client = createPostmanClient({ token: process.env.POSTMAN_API_KEY });

const workspaces = await client.workspaces.list();
const collections = await client.collections.list({ workspaceId: "ws-123" });
await client.import.openapi({ workspaceId: "ws-123", spec: myOpenApiSpec });
```

## Namespaces

| Namespace      | Methods                        |
| -------------- | ------------------------------ |
| `collections`  | `list`, `delete`               |
| `environments` | `list`, `create`, `update`     |
| `import`       | `openapi`                      |
| `me`           | `get`                          |
| `specs`        | `list`, `create`, `updateFile` |
| `workspaces`   | `list`                         |
