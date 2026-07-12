# @theholocron/confluence-client

TypeScript client for the Confluence REST API.

## Installation

```bash
pnpm add @theholocron/confluence-client
```

## Usage

```ts
import { createConfluenceClient } from "@theholocron/confluence-client";

const confluence = createConfluenceClient({
  baseUrl: "https://myorg.atlassian.net/wiki/rest/api",
  token: Buffer.from("agent@example.com:your-api-token").toString("base64"),
});

// Pages
const page = await confluence.page.get("123456");

await confluence.page.update("123456", {
  version: { number: 2 },
  title: "Updated page title",
  body: {
    storage: { value: "<p>New content</p>", representation: "storage" },
  },
});
```

## Auth

Confluence Cloud uses HTTP Basic auth with a base64-encoded `email:apiToken` string. Generate an API token at [id.atlassian.com/manage-profile/security/api-tokens](https://id.atlassian.com/manage-profile/security/api-tokens).

```ts
const token = Buffer.from("agent@example.com:your-api-token").toString("base64");
```

## API

### `createConfluenceClient(opts)`

| Option | Type | Description |
|--------|------|-------------|
| `baseUrl` | `string` | Confluence REST API base URL, e.g. `"https://myorg.atlassian.net/wiki/rest/api"` |
| `token` | `string` | Base64-encoded `email:apiToken` |

Returns a client with a `page` namespace.

### `client.page`

| Method | Description |
|--------|-------------|
| `get<T>(id)` | Fetch a page by ID |
| `update<T>(id, data)` | Update a page (requires `version.number` increment) |

## License

GPL-3.0 © [Newton Koumantzelis](https://github.com/iamnewton)
