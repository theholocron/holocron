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
npm i @theholocron/github-client
```

All packages follow the same lockstep versioning — see the
[releases page](https://github.com/theholocron/clients/releases) for the current version.
