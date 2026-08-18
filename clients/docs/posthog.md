---
title: PostHog Client
description: TypeScript client for the PostHog management API.
---

`@theholocron/posthog-client` wraps the PostHog personal API key endpoints for managing users and projects.

## Install

```bash
pnpm add @theholocron/posthog-client
```

## Usage

```ts
import { createPostHogClient } from "@theholocron/posthog-client";

const client = createPostHogClient({
  token: process.env.POSTHOG_PERSONAL_API_KEY!,
  // host: "https://eu.posthog.com", // EU cloud
});

const user = await client.users.me();
const { results } = await client.projects.list();
const project = await client.projects.create({ name: "my-app" });
console.log(project.api_token); // phc_* tracking token
```

## Exports

| Export                      | Description                                                      |
| --------------------------- | ---------------------------------------------------------------- |
| `createPostHogClient`       | Factory returning a client with `users` and `projects` resources |
| `PostHogClientOptions`      | Options type for `createPostHogClient`                           |
| `PostHogUser`               | Shape of `/api/users/@me/` response                              |
| `PostHogOrganization`       | Nested org object on `PostHogUser`                               |
| `PostHogProject`            | Shape of a project (includes `api_token`)                        |
| `PostHogProjectsResponse`   | Shape of `/api/projects/` list response                          |
| `CreatePostHogProjectInput` | Input for `projects.create()`                                    |
