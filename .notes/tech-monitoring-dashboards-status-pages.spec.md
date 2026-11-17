---
id: SPEC-0093
status: draft
issue: theholocron/holocron#2302
blocked-by: []
related:
  - theholocron/holocron#1599
  - theholocron/holocron#1160
discussion:
  url: https://discord.com/channels/1303969001822486568/1572129640720506960
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
  `tags` match its own (`useTagsAndOperator` for AND). `isPrivate`, `customDomain`, `customUrl`, `header` (required, and
  the only title it has).
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
   `listChecks`; `doctor monitoring` fails on a declared tag the check lacks. Declare Comlink's checks beside Sentinel's,
   and one for the docs site. Every check carries the tag of the component it belongs to.
2. **Dashboard.** `ensureDashboard` / `inspectDashboard`: one dashboard over a tag set, private by default.
3. **Status page.** `ensureStatusPage` / `inspectStatusPage`: one page, its components and the automation rules that tie
   tags to components, on `status.<domain>`.
4. **Heartbeats.** `ensureHeartbeat` / `listHeartbeats`, and a way to hand its ping URL to 1Password. **No heartbeat is
   declared in this change.** A heartbeat with nothing pinging it reports a missed run as soon as its period and grace
   pass, so the first declaration lands in the follow-up that wires a ping into the scheduled workflow, in the same pull
   request as that ping, never before it.

### Components

One status page lists every component, grouped if wanted: a page has many components, so Sentinel, Comlink and the docs
site share it. The research of the repo found these as the things that are hosted and that people depend on:

| Component | Where                                               | Check                                                            |
| --------- | --------------------------------------------------- | ---------------------------------------------------------------- |
| Sentinel  | `sentinel.<domain>/api/webhook` (Vercel)            | the two it has: a GET answers 405, an unsigned POST answers 401  |
| Comlink   | `comlink.<domain>/sentry` (Cloudflare Worker)       | a GET answers 405, an unsigned POST answers 401 (its own README) |
| Docs      | `docs.<domain>/holocron/` (the Starlight docs site) | a GET answers 200                                                |

The 405 and 401 checks set `shouldFail: true` (Sentinel's and Comlink's both do): Checkly treats a 4xx as a failed
request before it reads the assertions, so without it a healthy endpoint would be down.

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
  /** The title; also the idempotency key. The adapter sends it as Checkly's required `header`. */
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
  /** In the order they are shown. */
  components: MonitoringStatusComponentInput[];
}

interface MonitoringHeartbeatInput {
  /** Also the idempotency key. */
  name: string;
  period: number;
  periodUnit: "seconds" | "minutes" | "hours" | "days";
  grace: number;
  graceUnit: "seconds" | "minutes" | "hours" | "days";
  tags?: string[];
  alertChannels?: string[];
}

/** What the doctor reads back. Names and flags only: never a key or a ping URL. */
interface MonitoringDashboardState {
  exists: boolean;
  private?: boolean;
  tags?: string[];
  domain?: string;
  /** Names of the account's other dashboards, for an `info` row. */
  others: string[];
}

interface MonitoringStatusPageState {
  exists: boolean;
  public?: boolean;
  domain?: string;
  domainVerified?: boolean;
  domainRecord?: { type: "CNAME"; name: string; value: string };
  domainProblems: string[];
  missingComponents: string[];
  misplacedComponents: string[];
  missingRules: string[];
  /** On the page but not declared: left alone, reported. */
  extraComponents: string[];
  extraRules: string[];
}

interface MonitoringStatusPageResult extends EnsuredResource {
  components: { created: string[]; updated: string[] };
  rules: { created: string[]; updated: string[] };
  /** Present when the page declares a custom domain. */
  domain?: {
    name: string;
    /** The CNAME the provider asks for, until it is found. */
    record?: { type: "CNAME"; name: string; value: string };
    /** TXT records it also asks for (ownership, certificate). */
    extraRecords?: Array<{ type: "TXT"; name: string; value: string }>;
    verified: boolean;
  };
}

interface MonitoringHeartbeatResult {
  heartbeat: MonitoringCheck;
  alreadyExists: boolean;
  /** A credential: handed to a secret store, never printed, logged or written to the config. */
  pingUrl?: string;
}

interface Monitoring {
  // ...existing members
  /** Declared in the provider's own options, like `checks`; `holocron setup` loops each list. */
  readonly dashboards?: readonly MonitoringDashboardInput[];
  readonly statusPages?: readonly MonitoringStatusPageInput[];
  readonly heartbeats?: readonly MonitoringHeartbeatInput[];

  ensureDashboard?(input: MonitoringDashboardInput): Promise<EnsuredResource & { key?: string }>;
  inspectDashboard?(name: string): Promise<MonitoringDashboardState>;
  ensureStatusPage?(input: MonitoringStatusPageInput): Promise<MonitoringStatusPageResult>;
  /** Takes the whole declaration, because the comparison needs its components and domain. */
  inspectStatusPage?(input: MonitoringStatusPageInput): Promise<MonitoringStatusPageState>;
  ensureHeartbeat?(input: MonitoringHeartbeatInput): Promise<MonitoringHeartbeatResult>;
  /** Read-only, and without the ping URL, so the doctor compares a heartbeat without changing one. */
  listHeartbeats?(): Promise<MonitoringHeartbeatInput[]>;
}
```

`EnsuredResource` is the existing `{ id, created, updated? }`. Every method is optional: a provider with no dashboards
omits it. All are idempotent find-or-create-or-update by name, **never delete**, and a field left out is left alone on an
existing resource.

### Config

The checks stay with the app that owns the hostname (`apps/sentinel`, `apps/comlink`). The dashboard and the page span
apps, so they live in the root `holocron.config.ts`, next to the docs check, in the `providers` block where the
`monitoring` entry already is (its original `"checkly"` is replaced in place, never a second key):

```ts
providers: {
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
},
```

`holocron.config.ts` is capped by `holocron-config-size.test.ts`. The block takes the cap from 230 to 260 lines (the
config is 259), raised with this reason stated, as it was for `doctor.manualSecrets`; a `monitoring` area in `.holocron/`
is the alternative (see choices). `holocron setup` then ensures each check, dashboard and page the provider lists.

### The status page's domain

`status.theholocron.dev` is one label under the zone, which the free Cloudflare certificate covers. Checkly verifies a
custom domain by a DNS record: `ensureStatusPage` reports the records it needs (a `CNAME`, and any `TXT` ones) and the
CLI makes them through the `dns` provider, the way `new tunnel` makes its `CNAME`; `/custom-domain-verifications/recheck`
settles it. The record is made DNS-only (`proxied: false`) so the provider can verify it; whether Checkly accepts a
proxied one is not confirmed.

### Incidents and Discord

An automation rule can open an incident on its own, and a status page's subscribers are email only: the REST API has no
webhook for an incident. What already reaches Discord is the failing check itself, through the existing alert channel
(`feeds.monitoring`, `#uptime`). The incident's own text and later updates are not mirrored. A follow-up could poll
`GET /v3/status-pages/{id}/incidents` and post new incidents and updates through the `notifications` capability (as the
PR feed does); it is not part of this spec.

A check made through the API is never subscribed to an alert channel on its own, and `holocron setup` ensures the checks
but not the channel's subscriptions. So the rollout has one more step: after `holocron setup`, run `holocron setup
notifications` again, which subscribes every check the account now holds (`ensureAlertChannel`, add-only). Until then
the new checks open incidents on the page without posting their failures to `#uptime`.

### Secrets

- A **private dashboard's key** is a credential. If the provider makes one, `ensureDashboard` returns it once as `key`; it
  is never printed or written to the config. It is held in 1Password, in the `dev` layer (`<org/repo> - dev`: never synced,
  so CI never holds it), as `HOLOCRON_CHECKLY_DASHBOARD_KEY`, handed over through `.holocron/.private/.credentials` for the
  1Password import, the way `export tokens` does (`finishCredentialsFile()`). `doctor.manualSecrets` lists the name, since
  nothing syncs it. The key is handed over only for a dashboard this run made or switched to private, so a run that
  stopped before the file was written finds the dashboard already private and returns no key. That is a known gap, not
  solved here: the recovery is to regenerate the key in Checkly (or switch the dashboard to public and run setup again).
  Whether Checkly returns an existing key on a read is not confirmed, so the spec does not rely on it.
- A **heartbeat's ping URL** is a credential too: anyone holding it can fake a success. It is held in the `ci` layer as
  `HOLOCRON_HEARTBEAT_<NAME>`, handed over the same way. GitHub scopes a secret to a repository or an Environment, never
  to one workflow, so a repository secret is readable by every workflow of the repo that runs with secrets. What that
  exposes is bounded (someone with that access could mask a missed run, and read nothing else), and no workflow reads a
  ping URL in this change. The follow-up that wires the ping must decide the scope before it syncs a URL: an Actions
  Environment limited to the protected branches is the stricter choice, and the hand-off here does not depend on it.
  The config holds names only.
- The CLI cannot write to 1Password, so the import file is the hand-off in both cases.

### Who may make a component go down

An automation rule matches by tag, so any check in the account carrying a component's tag can open an incident on that
component. Whether Checkly's roles let someone create a check without being able to edit the status page is not
confirmed, so the spec assumes they cannot be told apart: this is a boundary of the account, and write access to it is
kept to the maintainers. A doctor row for a check that carries a component's tag and that the config does not declare
would make one added by hand visible; it is a follow-up, not part of this change.

### Doctor

`doctor monitoring` gains one row each for the dashboard, the status page and the heartbeats: the resource exists; its
privacy matches the declaration (a page declared private that is public, or a dashboard declared private that is public, is
a failure); the tags, components and rules are as declared; and the custom domain is verified (a record still to make is a
`todo` that fails the run, as the notification layout's are). Heartbeats are compared through `listHeartbeats`
(period, grace, tags), never created. What the account holds beyond the config is an `info` row: a component or rule the
config no longer lists (it stays active until removed by hand), or another dashboard.

## Choices to review

- **Where the root's `monitoring` block lives.** Inline in `holocron.config.ts` with the cap raised (this spec's choice, the
  smallest change), or a new `monitoring` area in `.holocron/` (`HOLOCRON_AREAS`, `placeAreas()`, Sentinel's loader
  already reads a new area with no change) which keeps the config short but is a larger change.
- **Checkly's plan.** The free plan refuses a private dashboard (`400`) and a custom domain on a status page (`402`),
  found when `holocron setup` first ran. This repo declares the dashboard public (`private: false`) and the page with no
  `domain`, so it is served at `<slug>.checkly-dashboards.com`; the code's defaults (private, a custom domain) are
  unchanged, and a paid plan drops the two overrides.
- **Rule impact.** Each rule impacts its component as a major outage when a check fails; a partial or degraded impact for a
  slow check is a later setting.
- **Heartbeat period units.** Declared as the provider takes them (`seconds`, `minutes`, `hours`, `days`).
- **Removing a retired component or rule.** `setup` never deletes (the org rule for every provider), so a component or rule
  dropped from the declaration stays on the live page, and its rule can still open an incident, until a person removes it
  in Checkly. The doctor says so in an `info` row. Deleting on `setup` was considered and left out: one run that reads a
  half-edited config would take a public component off the page.
- **Two setups at once.** Checkly has no uniqueness on a name, so two runs that overlap could each make one. Setup is run by
  one maintainer, by hand, so it is not serialised; a duplicate is seen by the doctor (a second dashboard is an `info`
  row) and removed by hand.

## Not decided / follow-ups

- Mirroring an incident's text and updates to Discord (above).
- A ping step in each scheduled workflow, the first declared heartbeats, and the scope of their secret.
- A doctor row for an undeclared check that carries a declared component's tag.
- Status page theming and a logo.
- Subscribers (email) are not declared: people subscribe themselves.
