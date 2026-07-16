# `@theholocron/clerk-client`

TypeScript client for the [Clerk Backend API](https://clerk.com/docs/reference/backend-api).

## Install

```bash
pnpm add @theholocron/clerk-client
```

## Usage

```ts
import { createClerkClient } from "@theholocron/clerk-client";

const clerk = createClerkClient({ token: process.env.CLERK_SECRET_KEY! });

// List users
const users = await clerk.users.list({ limit: 10 });

// Get a user by ID
const user = await clerk.users.get("user_abc123");

// Create a user
const newUser = await clerk.users.create({
  first_name: "Jane",
  last_name: "Doe",
  email_address: ["jane@example.com"],
});

// Update a user
await clerk.users.update("user_abc123", { first_name: "Janet" });

// Delete a user
await clerk.users.delete("user_abc123");

// Ban / unban
await clerk.users.ban("user_abc123");
await clerk.users.unban("user_abc123");

// Lock / unlock
await clerk.users.lock("user_abc123");
await clerk.users.unlock("user_abc123");
```

## Status

`v0.3.2` — published on npm. APIs may shift before v1.
