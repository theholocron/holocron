---
title: Sentry Plugin
description: Implements the observability capability against Sentry's management API.
---

`@theholocron/holocron-plugin-sentry` implements the `observability` capability using Sentry's management API. It handles project provisioning and DSN retrieval for error tracking.

## Install

```bash
pnpm add -D @theholocron/holocron-plugin-sentry
```

## Capabilities

| Capability      | Token required                     |
| --------------- | ---------------------------------- |
| `observability` | `HOLOCRON_SENTRY_TOKEN` (`sentry`) |

## Config

```ts
providers: {
  observability: ["sentry", {
    // Required: your Sentry organization slug
    org: "my-org",
  }],
}
```

### Options

| Option | Required | Description                                                  |
| ------ | -------- | ------------------------------------------------------------ |
| `org`  | Yes      | Sentry organization slug                                     |
| `team` | No       | Default team slug for project creation. Defaults to org slug |

## Authentication

```bash
holocron auth set sentry <TOKEN>
```

Or via env var:

```bash
export HOLOCRON_SENTRY_TOKEN=<TOKEN>
# Also recognized:
export SENTRY_AUTH_TOKEN=<TOKEN>
```

Generate an auth token at Sentry → Settings → Auth Tokens with **project:read**, **project:write**, and **org:read** scopes.

## What `observability` provides

- `describe()` — returns the provider name and required env var keys (`SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`)
- `whoami()` — verifies the token by fetching the organization
- `ensureProject(input)` — create or retrieve a Sentry project, returning its DSN and whether it already existed

## Example

```ts
import { createPlugin } from "@theholocron/holocron-plugin-sentry";

const plugin = createPlugin({
  token: process.env.HOLOCRON_SENTRY_TOKEN,
  org: "my-org",
});
const obs = plugin.capabilities.observability();

const { dsn, alreadyExists } = await obs.ensureProject({
  name: "my-app",
  platform: "node",
});
console.log(`DSN: ${dsn} (${alreadyExists ? "existing" : "created"})`);
```
