---
status: draft
issue: theholocron/holocron#2302
blocked-by: []
related:
  - theholocron/holocron#1599
  - theholocron/holocron#1160
---

# `monitoring`: tags, a dashboard, a status page and heartbeats

## Problem

`monitoring` declares two Checkly checks, both Sentinel's, and nothing joins them. There is no one place to see what is
up, no public page for the audience the org is building, and a check added later appears nowhere. `apps/comlink` and
the docs site have no check, so a dead relay Worker (its Sentry-to-Discord alerts vanish without a sign) or a broken docs
deploy goes unnoticed. A scheduled workflow that stops running is also silent: #alerts hears about a run that errors, not
about one that never starts (`check-tokens` was red for eight days).

## What the provider's API supports

Read from Checkly's `openapi.json` (v1), so everything goes through `@theholocron/checkly-client` and the
provider-neutral `monitoring` capability, never through `checkly/constructs` (a second manager of the same account, and a
Checkly-only CLI):

- **Dashboards**: `GET/POST /v1/dashboards`, `GET/PUT/DELETE /v1/dashboards/{id}`. A dashboard shows the checks whose
  `tags` match its own (`useTagsAndOperator` for AND). `isPrivate`, `customDomain`, `customUrl`, `header` (required).
- **Status pages**: the component-based `/v3/status-pages` with `/components` (`SERVICE` or `GROUP`, `displayOrder`,
  `hidden`, `parentId`), `/automation-rules` and `/custom-domain-verifications`. `isPrivate`, `customDomain`,
  `allowIndexing`. A component holds no check reference: an **automation rule** ties them (a failing check whose tags
  overlap the rule's opens one incident on the components the rule lists, each with a `targetImpact`).
- **Heartbeats**: `POST /v1/checks/heartbeat`, `PUT /v1/checks/heartbeat/{id}` (`period`, `periodUnit`, `grace`,
  `graceUnit`, optional `pingToken`); the response carries the ping URL the job calls on success.
- **Subscribers** of a status page are email addresses only, and there is no webhook (see "Incidents and Discord").

So **tags on checks are the join** for the dashboard and the status page alike.

## Decision

Four parts, each its own pull request, merged in this order (a stack). The parts are independent in code, so they can be
built at the same time; only the merge order is fixed.

1. **Tags, and the checks that were missing.** `MonitoringCheckInput.tags`, passed through `ensureCheck` and read back by
   `listChecks`. Declare Comlink's checks beside Sentinel's, and one for the docs site. Every check carries the tag of the
   component it belongs to.
2. **Dashboard.** `ensureDashboard` / `inspectDashboard`: one dashboard over a tag set, private by default.
3. **Status page.** `ensureStatusPage` / `inspectStatusPage`: one page, its components and the automation rules that tie
   tags to components, on `status.<domain>`.
4. **Heartbeats.** `ensureHeartbeat`, and a way to hand its ping URL to 1Password. Wiring a ping into each scheduled
   workflow is a follow-up, not part of this.

### Components

One status page lists every component, grouped if wanted: a page has many components, so Sentinel, Comlink and the docs
site share it. The research of the repo found these as the things that are hosted and that people depend on:

| Component | Where                                               | Check                                                            |
| --------- | --------------------------------------------------- | ---------------------------------------------------------------- |
| Sentinel  | `sentinel.<domain>/api/webhook` (Vercel)            | the two it has: a GET answers 405, an unsigned POST answers 401  |
| Comlink   | `comlink.<domain>/sentry` (Cloudflare Worker)       | a GET answers 405, an unsigned POST answers 401 (its own README) |
| Docs      | `docs.<domain>/holocron/` (the Starlight docs site) | a GET answers 200                                                |

Left out on purpose: **Council** (an Obsidian plugin that runs on a laptop; nothing is hosted), and `sentinel-dev.<domain>`
(a tunnel to one machine, up only while a person runs it). A component is added by adding a check with its tag and one
entry to the page.

### Capability shape (names are the provider-neutral ones; Checkly's own terms stay in the adapter)

```ts
interface MonitoringCheckInput {
  // ...existing fields
  /** Labels that group checks: a dashboard and a status component pick checks by them. */
  tags?: string[];
}

interface MonitoringDashboardInput {
  /** The title; also the idempotency key. */
  name: string;
  description?: string;
  /** Checks carrying any of these tags are shown. */
  tags: string[];
  /** Default true: a dashboard shows check URLs and timings. */
  private?: boolean;
  /** A hostname on the org's zone, if wanted. */
  domain?: string;
}

interface MonitoringStatusComponentInput {
  name: string;
  description?: string;
  /** A failing check carrying any of these tags opens an incident on this component. */
  tags: string[];
  /** A group to show it under; made if absent. */
  group?: string;
}

interface MonitoringStatusPageInput {
  /** The page's title; also the idempotency key. */
  name: string;
  /** The page's address segment on the provider. */
  slug: string;
  /** A hostname on the org's zone, `status.<domain>`. */
  domain?: string;
  description?: string;
  logo?: string;
  /** Default false: the point of the page is that people can read it. */
  private?: boolean;
  components: MonitoringStatusComponentInput[];
}

interface Monitoring {
  // ...existing members
  ensureDashboard?(input: MonitoringDashboardInput): Promise<EnsuredResource & { key?: string }>;
  inspectDashboard?(name: string): Promise<MonitoringDashboardState>;
  ensureStatusPage?(input: MonitoringStatusPageInput): Promise<MonitoringStatusPageResult>;
  inspectStatusPage?(name: string): Promise<MonitoringStatusPageState>;
  ensureHeartbeat?(input: MonitoringHeartbeatInput): Promise<MonitoringHeartbeatResult>;
}
```

`EnsuredResource` is the existing `{ id, created, updated? }`. The result and state types follow the existing alert
channel ones (`MonitoringAlertChannelResult`, `MonitoringAlertChannelState`): what was made, what was brought in line,
and for the doctor what the account holds now. Every method is optional: a provider with no dashboards omits it. All are
idempotent find-or-create-or-update by name, **never delete** (a component, group or rule the config no longer lists is
left and reported by the doctor as an `info` row), and a field left out is left alone on an existing resource.

### Config

The checks stay with the app that owns the hostname (`apps/sentinel`, `apps/comlink`). The dashboard and the page span
apps, so they live in the root `holocron.config.ts`, next to the docs check:

```ts
monitoring: ["checkly", {
	checks: [{ name: "Docs", url: `https://docs.${domain}/holocron/`, tags: ["docs"], locations: ["us-east-1"],
		assertions: [{ source: "status_code", comparison: "equals", target: "200" }] }],
	dashboards: [{ name: "The Holocron", tags: ["sentinel", "comlink", "docs"] }],
	statusPages: [{
		name: "The Holocron", slug: "theholocron", domain: `status.${domain}`,
		components: [
			{ name: "Sentinel", tags: ["sentinel"] },
			{ name: "Comlink", tags: ["comlink"] },
			{ name: "Docs", tags: ["docs"] },
		],
	}],
}],
```

The root config has no `monitoring` provider today, and `holocron.config.ts` is capped at 215 lines
(`holocron-config-size.test.ts`). The block is about 25 lines, so the cap is raised with this reason stated, as it was for
`doctor.manualSecrets`; a `monitoring` area in `.holocron/` is the alternative (see choices).

### The status page's domain

`status.theholocron.dev` is one label under the zone, which the free Cloudflare certificate covers. Checkly verifies a
custom domain by a DNS record: `ensureStatusPage` reports the record it needs (`GET .../custom-domain-verifications`) and
the CLI makes it through the `dns` provider, the way `new tunnel` makes its `CNAME`; `/custom-domain-verifications/recheck`
settles it. Whether the record must be DNS-only (not proxied) is read from the verification response, not assumed.

### Incidents and Discord

An automation rule can open an incident on its own, and a status page's subscribers are email only: the REST API has no
webhook for an incident. What already reaches Discord is the failing check itself: the same check that opens the incident
posts to `#uptime` through the existing alert channel (`feeds.monitoring`). The incident's own text and later updates are
not mirrored. A follow-up could poll `GET /v3/status-pages/{id}/incidents` and post new incidents and updates through the
`notifications` capability (as the PR feed does); it is not part of this spec.

### Secrets

- A **private dashboard's key** is a credential. If the provider makes one, `ensureDashboard` returns it once as `key`; it
  is never printed or written to the config. It is held in 1Password, in the `dev` layer (`<org/repo> - dev`: never synced,
  so CI never holds it), as `HOLOCRON_CHECKLY_DASHBOARD_KEY`, handed over through `.holocron/.private/.credentials` for the
  1Password import, the way `export tokens` does (`finishCredentialsFile()`). `doctor.manualSecrets` lists the name, since
  nothing syncs it.
- A **heartbeat's ping URL** is a credential too: anyone holding it can fake a success. It is held in the `ci` layer as
  `HOLOCRON_HEARTBEAT_<NAME>`, handed over the same way, and synced to the repository only (`repo.secrets.sync`), so only
  the workflow that pings it reads it. The config holds names only.
- The CLI cannot write to 1Password, so the import file is the hand-off in both cases.

### Doctor

`doctor monitoring` gains one row each for the dashboard, the status page and the heartbeats: the resource exists; its
privacy matches the declaration (a page declared private that is public, or a dashboard declared private that is public, is
a failure); the tags, components and rules are as declared; and the custom domain is verified (a record still to make is a
`todo` that fails the run, as the notification layout's are). What the account holds beyond the config is an `info` row.

## Choices to review

- **Where the root's `monitoring` block lives.** Inline in `holocron.config.ts` with the cap raised (this spec's choice, the
  smallest change), or a new `monitoring` area in `.holocron/` (`HOLOCRON_AREAS`, `placeAreas()`, Sentinel's loader
  already reads a new area with no change) which keeps the config short but is a larger change.
- **Rule impact.** Each rule impacts its component as a full outage when a check fails; a partial or degraded impact for a
  slow check is a later setting.
- **Heartbeat period units.** Declared as the provider takes them (`minutes`, `hours`, `days`).

## Not decided / follow-ups

- Mirroring an incident's text and updates to Discord (above).
- A ping step in each scheduled workflow, which touches the generated reusables and thin callers.
- Status page theming and a logo.
- Subscribers (email) are not declared: people subscribe themselves.
