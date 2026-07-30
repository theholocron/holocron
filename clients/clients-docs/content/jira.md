---
title: Jira Client
description: TypeScript client for the Jira Cloud REST API, built on @theholocron/http-client.
---

`@theholocron/jira-client` is a typed wrapper around the Jira Cloud REST API v2 for managing issues, projects, versions, and transitions.

## Install

```bash
npm i @theholocron/jira-client
```

## Usage

```ts
import { createJiraClient } from "@theholocron/jira-client";

const token = Buffer.from(
  `${process.env.ATLASSIAN_EMAIL}:${process.env.ATLASSIAN_TOKEN}`,
).toString("base64");

const client = createJiraClient({
  host: "https://myorg.atlassian.net",
  token,
});

const issue = await client.issues.get("PROJ-123");
const issues = await client.issues.search({
  jql: 'project = PROJ AND status = "In Progress"',
});
await client.transitions.create("PROJ-123", { transitionId: "31" });
```

## Authentication

Jira uses HTTP Basic auth. The `token` must be a Base64-encoded `email:apiToken` string — not a raw API token:

```ts
const token = Buffer.from(`${email}:${apiToken}`).toString("base64");
```

Generate an API token at **Atlassian account settings → Security → API tokens**. The `host` is your Atlassian domain, e.g. `https://myorg.atlassian.net`.

## Namespaces

| Namespace     | Methods                                                       |
| ------------- | ------------------------------------------------------------- |
| `issues`      | `create`, `get`, `getMany`, `update`, `getProperty`, `search` |
| `links`       | `create`, `createMany`, `getLinkTypes`                        |
| `projects`    | `get`                                                         |
| `transitions` | `create`, `get`, `getResolutions`                             |
| `versions`    | `create`, `get`, `getMany`, `update`, `delete`                |
