# `@theholocron/checkly-client`

TypeScript client for the [Checkly API](https://developers.checklyhq.com/).

## Install

```bash
pnpm add @theholocron/checkly-client
```

## Usage

```ts
import { createChecklyClient } from "@theholocron/checkly-client";

const checkly = createChecklyClient({
  token: process.env.CHECKLY_API_KEY!,
  accountId: process.env.CHECKLY_ACCOUNT_ID!,
});

// Find an existing check by name (case-insensitive partial match)
const existing = await checkly.checks.list({ search: "sentinel webhook" });

// Create an API check
const check = await checkly.checks.create({
  name: "Sentinel webhook uptime",
  frequency: 5,
  locations: ["us-east-1"],
  request: {
    url: "https://sentinel.theholocron.dev/api/webhook",
    method: "GET",
    assertions: [{ source: "STATUS_CODE", comparison: "EQUALS", target: "405" }],
  },
});

// Update it
await checkly.checks.update(check.id, {
  name: "Sentinel webhook uptime",
  frequency: 10,
  request: check.request,
});

// Delete it
await checkly.checks.delete(check.id);
```

## Auth

Generate an [API key](https://www.checklyhq.com/docs/accounts-and-users/creating-api-key/)
from your Checkly account settings. Every request also requires the target
account id (visible at `https://app.checklyhq.com/settings/account/general`)
— Checkly's API has no notion of a single "current" account per key.

The token is passed directly or read from `CHECKLY_API_KEY`; the account id
from `CHECKLY_ACCOUNT_ID`. Neither has a default — both are required.

> **Note:** This client only covers API checks (`checks.*`, the
> `/v1/checks/api` and `/v1/checks` endpoints) — the subset this org
> currently provisions programmatically. Checkly's full surface (browser
> checks, check groups, alert channels, dashboards) is out of scope until a
> real consumer needs it.
