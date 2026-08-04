---
title: Confluence Client
description: TypeScript client for the Confluence Cloud REST API, built on @theholocron/http-client.
---

`@theholocron/confluence-client` is a typed wrapper around the Confluence Cloud REST API for reading and updating pages.

## Install

```bash
pnpm add @theholocron/confluence-client
```

## Usage

```ts
import { createConfluenceClient } from "@theholocron/confluence-client";

const token = Buffer.from(`${process.env.ATLASSIAN_EMAIL}:${process.env.ATLASSIAN_TOKEN}`).toString("base64");

const client = createConfluenceClient({
	baseUrl: "https://myorg.atlassian.net/wiki/rest/api",
	token,
});

const page = await client.page.get("123456789");
await client.page.update("123456789", {
	title: "Updated title",
	body: "<p>New content</p>",
});
```

## Authentication

Confluence uses HTTP Basic auth. The `token` must be a Base64-encoded `email:apiToken` string — not a raw API token:

```ts
const token = Buffer.from(`${email}:${apiToken}`).toString("base64");
```

Generate an API token at **Atlassian account settings → Security → API tokens**. The `baseUrl` must include the full REST API path, e.g. `https://myorg.atlassian.net/wiki/rest/api`.

## Namespaces

| Namespace | Methods         |
| --------- | --------------- |
| `page`    | `get`, `update` |
