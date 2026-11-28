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
  tags: ["sentinel"], // what a dashboard or a status page picks the check by
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

## Check status

```ts
// Has the latest run failed? A check that has not run yet has no status (404) or no `lastCheckRunId`.
const status = await checkly.checkStatuses.get(check.id);
if (status.lastCheckRunId && status.hasFailures) console.log("failing");
```

## Heartbeats

```ts
// A heartbeat expects a ping from a job each `period`, and alerts when none arrives within `grace`.
// Units: "seconds" | "minutes" | "hours" | "days".
const beat = await checkly.heartbeats.create({
  name: "check-tokens",
  tags: ["ci"],
  heartbeat: { period: 1, periodUnit: "days", grace: 2, graceUnit: "hours" },
});
// The ping URL a job calls on success. A credential: anyone holding it can fake a success. Never log it.
const pingUrl = beat.heartbeat.pingUrl;

await checkly.heartbeats.update(beat.id, {
  name: beat.name,
  // Send the ping token back so the URL does not change.
  heartbeat: { period: 2, periodUnit: "days", grace: 2, graceUnit: "hours", pingToken: beat.heartbeat.pingToken },
});

const some = await checkly.heartbeats.list({ search: "check" }); // one page, heartbeats only
const all = await checkly.heartbeats.listAll(); // every page
```

Checkly's `GET /checks` lists every kind of check, heartbeats included (`checkType: "HEARTBEAT"`), and returns each one's `pingUrl` on every read. `heartbeats.list` and `listAll` keep only the heartbeats. Delete one with `checks.delete(id)`, which works for any type.

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

## Dashboards

```ts
// A dashboard shows the checks whose tags match its own. It has no name: find one by its `header`.
const found = (await checkly.dashboards.list()).find((d) => d.header === "The Holocron");

const made = await checkly.dashboards.create({
  header: "The Holocron", // required
  tags: ["sentinel", "docs"],
  isPrivate: true, // a private dashboard needs a key to be read
});
made.keys; // [{ id, rawKey, maskedKey, ... }]: rawKey is a credential, never log it

// The update schema has no required field: only what you pass is sent.
await checkly.dashboards.update(made.dashboardId, { tags: ["sentinel", "comlink", "docs"] });
const one = await checkly.dashboards.get(made.dashboardId);
```

The single-dashboard calls take the string `dashboardId`, not the numeric `id`. There is no delete here.

## Status pages (v3)

`statusPages.*` talks to Checkly's v3 API (`/v3/status-pages`; the client derives the `/v3` base from the `/v1` one, so
`baseUrl` still ends in `/v1`). A component holds no check: an automation rule ties a failing check's tags to the
components it lists, each with a `targetImpact` (`UNDER_MAINTENANCE`, `DEGRADED_PERFORMANCE`, `PARTIAL_OUTAGE` or
`MAJOR_OUTAGE`).

```ts
const page = await checkly.statusPages.create({ name: "The Holocron", url: "theholocron", isPrivate: false });
const group = await checkly.statusPages.components.create(page.id, {
  name: "Services",
  type: "GROUP",
  displayOrder: 0,
});
const sentinel = await checkly.statusPages.components.create(page.id, {
  name: "Sentinel",
  type: "SERVICE",
  displayOrder: 0,
  parentId: group.id,
});
await checkly.statusPages.rules.create(page.id, {
  name: "Sentinel",
  firstUpdate: "Sentinel is failing its checks.",
  lastUpdate: "Sentinel is passing its checks again.",
  tags: ["sentinel"],
  components: [{ componentId: sentinel.id, targetImpact: "MAJOR_OUTAGE" }],
});

// A custom domain (`customDomain: "status.example.com"` on the page): the DNS record Checkly asks for, and a re-check.
const verification = await checkly.statusPages.customDomain.verification(page.id); // `CNAME`, `ownershipVerification`, ...
await checkly.statusPages.customDomain.recheck(page.id);
```

`list` calls follow `nextId` to the end. `statusPages.update` and `components.update` replace the whole resource, so send
every field you want to keep.

> **Note:** This client covers API checks (`checks.*`), alert channels (`alertChannels.*`), dashboards
> (`dashboards.*`), status pages (`statusPages.*`) and heartbeats (`heartbeats.*`) — the subset this org currently provisions programmatically.
> Checkly's full surface (browser checks, check groups) is out of scope until a real consumer needs it.
