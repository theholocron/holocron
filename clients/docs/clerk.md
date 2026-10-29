---
title: Clerk Client
description: TypeScript client for the Clerk user management API, built on @theholocron/http-client.
---

`@theholocron/clerk-client` is a typed wrapper around the Clerk backend API for managing users, instances, and webhooks.

## Install

```bash
pnpm add @theholocron/clerk-client
```

## Usage

```ts
import { createClerkClient } from "@theholocron/clerk-client";

const client = createClerkClient({ token: process.env.CLERK_SECRET_KEY });

const users = await client.users.list();
const user = await client.users.get("user_abc123");
await client.users.ban("user_abc123");
```

## Namespaces

| Namespace  | Methods                                                                                |
| ---------- | -------------------------------------------------------------------------------------- |
| `instance` | `get`                                                                                  |
| `users`    | `list`, `count`, `get`, `create`, `update`, `delete`, `ban`, `unban`, `lock`, `unlock` |
| `webhooks` | `ensureSvixApp`, `getSvixUrl`                                                          |
