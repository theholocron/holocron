---
title: Clients
description: TypeScript HTTP clients for third-party APIs, built on @theholocron/http-client.
sidebar:
    hidden: true
---

`@theholocron/clients` is a pnpm monorepo of typed HTTP clients for popular third-party APIs.
Every client wraps `@theholocron/http-client` — a thin fetch-based layer that handles token
resolution, base URL construction, and normalised error responses.

## Packages

| Package                                          | Description                         |
| ------------------------------------------------ | ----------------------------------- |
| [`@theholocron/clerk-client`](./clerk)           | Clerk user management               |
| [`@theholocron/confluence-client`](./confluence) | Confluence Cloud pages & spaces     |
| [`@theholocron/doppler-client`](./doppler)       | Doppler secrets manager             |
| [`@theholocron/github-client`](./github)         | GitHub REST API                     |
| [`@theholocron/google-client`](./google)         | Google Workspace APIs               |
| [`@theholocron/http-client`](./http)             | Shared HTTP primitives (base layer) |
| [`@theholocron/infisical-client`](./infisical)   | Infisical secrets manager           |
| [`@theholocron/jira-client`](./jira)             | Jira Cloud issues & projects        |
| [`@theholocron/neon-client`](./neon)             | Neon serverless Postgres            |
| [`@theholocron/postman-client`](./postman)       | Postman collections & environments  |
| [`@theholocron/vercel-client`](./vercel)         | Vercel deployments & projects       |
| [`@theholocron/zendesk-client`](./zendesk)       | Zendesk tickets & users             |

## Install

Each package is published independently to npm:

```bash
pnpm add @theholocron/github-client
```

All packages follow the same lockstep versioning — see the
[releases page](https://github.com/theholocron/clients/releases) for the current version.

## Authentication

Every client is initialised with a token obtained from the service's API settings page. The token is sent as a `Bearer` authorization header on every request:

```ts
const client = createGitHubClient({ token: process.env.GITHUB_TOKEN });
```

A few clients require a different token format — see each client's page for details.

## Configuration

All `createXxxClient()` factories accept the same base options:

| Option    | Required | Description                                                        |
| --------- | -------- | ------------------------------------------------------------------ |
| `token`   | Yes      | API token from the service's developer settings                    |
| `baseUrl` | No       | Override the default API base URL (self-hosted instances, proxies) |
| `fetch`   | No       | Custom fetch implementation — see [Testing](#testing) below        |

## Error handling

All clients throw `ProviderApiError` (from `@theholocron/http-client`) on non-2xx responses. The error exposes the HTTP `status` code and the parsed response body.

```ts
import { ProviderApiError } from "@theholocron/http-client";

try {
	const issue = await client.issues.get("PROJ-1");
} catch (err) {
	if (err instanceof ProviderApiError) {
		console.error(err.status, err.message);
	}
}
```

## Testing

Every client accepts a `fetch` option so you can inject a stub without patching the global. This keeps tests hermetic and avoids `vi.stubGlobal` / `jest.spyOn`:

```ts
import { createGitHubClient } from "@theholocron/github-client";

const calls: Request[] = [];
const fetch = async (req: Request) => {
	calls.push(req);
	return new Response(JSON.stringify({ id: 1 }), { status: 200 });
};

const client = createGitHubClient({ token: "test", fetch });
```
