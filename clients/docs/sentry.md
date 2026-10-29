---
title: Sentry Client
description: TypeScript client for the Sentry API — manage organizations and projects.
---

`@theholocron/sentry-client` wraps the Sentry REST API for managing organizations and projects.

## Install

```bash
pnpm add @theholocron/sentry-client
```

## Usage

```ts
import { createSentryClient } from "@theholocron/sentry-client";

const client = createSentryClient({
  token: process.env.SENTRY_AUTH_TOKEN!,
});

const org = await client.auth.getOrganization("my-org");
const projects = await client.projects.list("my-org");
const project = await client.projects.create("my-org", { name: "my-app", platform: "node" });
const keys = await client.projects.listKeys("my-org", "my-app");
```

## Exports

| Export                     | Description                                                     |
| -------------------------- | --------------------------------------------------------------- |
| `createSentryClient`       | Factory returning a client with `auth` and `projects` resources |
| `SentryClientOptions`      | Options type for `createSentryClient`                           |
| `SentryOrganization`       | Shape of a Sentry organization                                  |
| `SentryProject`            | Shape of a Sentry project                                       |
| `CreateSentryProjectInput` | Input for `projects.create()`                                   |
| `SentryKey`                | Shape of a project DSN key                                      |
| `SentryKeyDsn`             | Nested DSN object on `SentryKey`                                |
| `SentryClient`             | Return type of `createSentryClient`                             |
