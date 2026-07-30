---
title: Vercel Client
description: TypeScript client for the Vercel REST API, built on @theholocron/http-client.
---

`@theholocron/vercel-client` is a typed wrapper around the Vercel API for managing deployments, projects, and environment variables.

## Install

```bash
npm i @theholocron/vercel-client
```

## Usage

```ts
import { createVercelClient } from "@theholocron/vercel-client";

const client = createVercelClient({
  token: process.env.VERCEL_TOKEN,
  teamId: process.env.VERCEL_TEAM_ID,
});

const projects = await client.projects.list();
const deployment = await client.deployments.trigger({ projectId: "prj-123" });
const envVars = await client.env.list("prj-123", "production");
```

## Configuration

`teamId` is required when accessing team-owned resources (projects, deployments, env vars). Without it, requests target personal account resources only. You can find the team ID in **Vercel dashboard → Team Settings → General**.

| Option    | Required | Description                                   |
| --------- | -------- | --------------------------------------------- |
| `token`   | Yes      | Vercel API token (account settings → Tokens)  |
| `teamId`  | No       | Team ID; required for team-scoped resources   |
| `baseUrl` | No       | Override the default `https://api.vercel.com` |
| `fetch`   | No       | Custom fetch for testing                      |

## Namespaces

| Namespace     | Methods                           |
| ------------- | --------------------------------- |
| `deployments` | `trigger`, `get`                  |
| `env`         | `list`, `set`                     |
| `projects`    | `list`, `get`, `create`, `update` |
| `user`        | `get`                             |
