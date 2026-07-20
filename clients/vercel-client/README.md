# `@theholocron/vercel-client`

TypeScript client for the [Vercel API](https://vercel.com/docs/rest-api).

## Install

```bash
pnpm add @theholocron/vercel-client
```

## Usage

```ts
import { createVercelClient } from "@theholocron/vercel-client";

const vercel = createVercelClient({
  token: process.env.VERCEL_TOKEN!,
  teamId: process.env.VERCEL_TEAM_ID, // optional; appended to every request
});

// Get the authenticated user
const { user } = await vercel.user.get();

// List projects
const { projects } = await vercel.projects.list();

// Get a project by name or id
const project = await vercel.projects.get("my-app");

// Create a project
const created = await vercel.projects.create({
  name: "my-app",
  framework: "nextjs",
  repo: "org/repo",
});

// Update project settings
await vercel.projects.update("project-id", {
  previewDeploymentsDisabled: true,
});

// List env vars
const { envs } = await vercel.env.list("project-id");

// Set (upsert) an env var
await vercel.env.set(
  "project-id",
  "production",
  "API_URL",
  "https://api.example.com",
);

// Trigger a deployment
const deployment = await vercel.deployments.trigger({
  projectName: "my-app",
  branch: "main",
  repoId: project.link?.repoId!,
  target: "production",
});

// Poll deployment status
const status = await vercel.deployments.get(deployment.id);
```

## Status

`v0.11.3` — published on npm. APIs may shift before v1.
