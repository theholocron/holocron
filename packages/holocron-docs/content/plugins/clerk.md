---
title: Clerk Plugin
description: Implements the auth capability against Clerk's Backend REST API.
---

`@theholocron/holocron-plugin-clerk` implements the `auth` capability using Clerk's Backend API. It also exports a `parseWebhook` utility for normalizing Clerk webhook events into the canonical `AuthEvent` shape.

## Install

```bash
pnpm add -D @theholocron/holocron-plugin-clerk
```

## Capabilities

| Capability | Token required |
| --- | --- |
| `auth` | `HOLOCRON_CLERK_SECRET_KEY` (`clerk`) |

## Config

```ts
providers: {
  auth: "clerk",
}
```

No options are required — the plugin resolves the secret key from `HOLOCRON_CLERK_SECRET_KEY` or the keyring.

## Authentication

```bash
holocron auth set clerk sk_live_xxx
```

Or via env var:
```bash
export HOLOCRON_CLERK_SECRET_KEY=sk_live_xxx
```

The secret key is found in the Clerk Dashboard → API Keys → Secret keys (`sk_live_...` for production, `sk_test_...` for development).

## What `auth` provides

- `describe()` — returns the provider name and required env var keys (`CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`)
- `whoami()` — verifies the secret key by calling the Clerk API
- `ensureWebhookApp()` — provisions a Svix webhook app (idempotent)
- `getWebhookDashboardUrl()` — returns the deep-link to the Svix dashboard
- `createUser(input)` — creates a Clerk user (email + password, optional name)
- `syncWebhook(input)` — wires the Clerk webhook endpoint into the project's repo

## Webhook events

Use `parseWebhook` to normalize Clerk's webhook payload into the canonical `AuthEvent`:

```ts
import { parseWebhook } from "@theholocron/holocron-plugin-clerk";

app.post("/webhooks/clerk", async (req) => {
  const event = await parseWebhook({
    body: req.body,
    headers: req.headers,
    signingSecret: process.env.CLERK_WEBHOOK_SECRET!,
  });
  // event.type: "user.created" | "user.updated" | "user.deleted"
  // event.user: { id, email, firstName, lastName }
  await db.users.upsert(event.user);
});
```

Swapping to a different auth plugin changes one import line — the handler logic stays the same.
