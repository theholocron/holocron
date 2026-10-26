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

// Create an API check. shouldFail: true is required whenever the
// "healthy" response is itself an HTTP error status (here, a 405) --
// without it, Checkly's platform-level retry/failure classification
// treats any 4xx/5xx as a failure before your assertions are even
// evaluated, regardless of whether they match.
const check = await checkly.checks.create({
  name: "Sentinel webhook uptime",
  frequency: 5,
  locations: ["us-east-1"],
  shouldFail: true,
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

// A second check with a request body -- e.g. to verify the endpoint's own
// signature checking, not just that it's reachable. request.body is sent
// as-is; the client sets Checkly's own bodyType to "RAW" whenever a body
// is given.
const signatureCheck = await checkly.checks.create({
  name: "Sentinel webhook signature verification",
  locations: ["us-east-1"],
  shouldFail: true,
  request: {
    url: "https://sentinel.theholocron.dev/api/webhook",
    method: "POST",
    body: "{}",
    assertions: [{ source: "STATUS_CODE", comparison: "EQUALS", target: "401" }],
  },
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

## Alert channels

```ts
import { DISCORD_TEMPLATE } from "@theholocron/checkly-client";

// A Discord channel is a WEBHOOK marked WEBHOOK_DISCORD. The template is not filled in for you when you create one
// through the API, so pass DISCORD_TEMPLATE (Checkly's own Discord message body).
const channel = await checkly.alertChannels.create({
  type: "WEBHOOK",
  config: {
    name: "Discord #uptime",
    url: "https://discord.com/api/webhooks/…", // a secret: anyone holding it can post
    method: "POST",
    headers: [],
    queryParameters: [],
    template: DISCORD_TEMPLATE,
    webhookType: "WEBHOOK_DISCORD",
  },
  sendFailure: true,
  sendRecovery: true,
  sendDegraded: true,
});

// Checks made through the API are never auto-subscribed. Subscribe each one with `subscribe`, then read the channel
// back: Checkly's create and update accept a `subscriptions` list but have been seen not to apply it.
await checkly.alertChannels.subscribe(channel.id, {
  checkId: check.id,
  activated: true,
});
const subscribed = (await checkly.alertChannels.get(channel.id)).subscriptions;

const all = await checkly.alertChannels.list(); // every page
const one = await checkly.alertChannels.get(channel.id);
await checkly.alertChannels.update(channel.id, {/* the complete channel */});
await checkly.alertChannels.delete(channel.id);
```

`update` replaces the whole channel (settings and subscriptions), so send everything you want to keep, and re-read the channel before updating it if anything may have subscribed a check since you last did. Checkly offers
no version check, so do not update one channel from two places at once.

> **Note:** This client covers API checks (`checks.*`) and alert channels (`alertChannels.*`) — the subset this org
> currently provisions programmatically. Checkly's full surface (browser checks, check groups, dashboards) is out of
> scope until a real consumer needs it.
