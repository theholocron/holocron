# @theholocron/zendesk-client

TypeScript client for the Zendesk API. Covers tickets, comments, fields, status, activities, search, and more.

## Installation

```bash
pnpm add @theholocron/zendesk-client
```

## Usage

```ts
import zendesk, { createToken, setToken } from "@theholocron/zendesk-client";

// Authenticate
setToken("agent@example.com", "your-api-token");

// Tickets
const ticket = await zendesk.tickets.get(12345);
const comments = await zendesk.tickets.comments.list(12345);

// Search
const results = await zendesk.search.query({ query: "type:ticket status:open" });

// Status
const statuses = await zendesk.status.listCustom();
```

## Auth

Zendesk uses HTTP Basic auth with a base64-encoded `user/token:apiToken` string. Generate an API token in your Zendesk Admin panel under **Apps and integrations → APIs → Zendesk API**.

```ts
import { createToken } from "@theholocron/zendesk-client";

const token = createToken("agent@example.com", "your-api-token");
// → base64 encoded "agent@example.com/token:your-api-token"
```

> **Note:** The implementation files using `@ce/` internal packages are being migrated to `@theholocron/http-client` (tracked in [#97](https://github.com/theholocron/clients/issues/97)). Types and mock utilities are fully available now.

## License

GPL-3.0 © [Newton Koumantzelis](https://github.com/iamnewton)
