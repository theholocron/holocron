# @theholocron/zendesk-client

TypeScript client for the Zendesk API. Covers tickets, comments, fields, status, activities, and search.

## Installation

```bash
pnpm add @theholocron/zendesk-client
```

## Usage

```ts
import { createZendeskClient, createToken } from "@theholocron/zendesk-client";

const zendesk = createZendeskClient({
  baseUrl: "https://myorg.zendesk.com",
  token: createToken("agent@example.com", "your-api-token"),
});

// Tickets
const ticket = await zendesk.tickets.get(12345);
const all = await zendesk.tickets.list();
await zendesk.tickets.create({ subject: "Bug report", comment: { body: "Details..." } });
await zendesk.tickets.update(12345, { status: "solved" });
await zendesk.tickets.delete(12345);

// Comments
const thread = await zendesk.comments.list(12345);
await zendesk.comments.create(12345, "Thanks for reaching out!");

// Fields
const fields = await zendesk.fields.list();
const field = await zendesk.fields.get(7);

// Status
const statuses = await zendesk.status.list();
await zendesk.status.create({ agent_label: "Escalated", status_category: "open" });

// Search
const results = await zendesk.search.query("type:ticket status:open assignee:me");

// Activities
const activities = await zendesk.activities.get();
```

## Auth

Zendesk uses HTTP Basic auth. Generate an API token in your Zendesk Admin panel under **Apps and integrations → APIs → Zendesk API**, then use `createToken` to encode your credentials:

```ts
import { createToken } from "@theholocron/zendesk-client";

const token = createToken("agent@example.com", "your-api-token");
// → base64("agent@example.com/token:your-api-token")
```

Pass `token` to `createZendeskClient` along with your subdomain base URL.

## API

### `createZendeskClient(opts)`

| Option | Type | Description |
|--------|------|-------------|
| `baseUrl` | `string` | Your Zendesk instance URL, e.g. `"https://myorg.zendesk.com"` |
| `token` | `string` | Encoded token from `createToken(email, apiToken)` |

Returns a client with `activities`, `comments`, `fields`, `search`, `status`, and `tickets` namespaces.

## License

GPL-3.0 © [Newton Koumantzelis](https://github.com/iamnewton)
