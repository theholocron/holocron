---
status: draft
issue: theholocron/holocron#2366
blocked-by: []
related:
  - theholocron/holocron#2302
  - theholocron/holocron#2324
  - theholocron/holocron#2359
  - theholocron/holocron#1738
  - theholocron/holocron#1535
---

# Mirror status page incidents to Discord

## Problem

An incident on the status page (opened by hand today; opened by an automation rule on a plan that allows it) reaches only
the page's subscribers, and a subscriber is an email address. Discord hears about a failing check, because the Checkly alert
channel posts to `#uptime`, but it does not hear about the incident: its title, who is affected, what the people running
the page said, and that it was resolved. People who watch Discord see "check X is failing" and never see what the page tells
the public.

#2366 asks for the opening, the updates and the resolution of an incident to be posted to a Discord channel. It leaves three
things to this spec: the trigger (poll the incident endpoints from a scheduled task, or receive a webhook through a Sentinel
or Comlink route), the channel (and whether it reuses `#uptime`), and de-duplication (one message per incident, edited as it
updates).

This spec is the design. It builds nothing.

## What an incident is here

A **status page incident**: an object on the Checkly status page `The Holocron` (declared in `.holocron/monitoring.ts`,
#2302), made either by a person in Checkly's UI or API, or, on a plan that allows it, by an **automation rule** when a check
carrying a component's tag fails (`tech-monitoring-dashboards-status-pages`). It has a name, component impacts, and a list of
**updates**, each with a status (`INVESTIGATING`, `IDENTIFIED`, `MONITORING`, `RESOLVED`) and a description.

It is **not** a failing check (that already reaches `#uptime`), not a Sentry issue (`#errors`, through Comlink) and not a
GitHub Actions failure (`#alerts`, `platform.notifications.yml`). Two things that look like incidents and are not covered:
Checkly's older v1 status page incidents (`/v1/status-pages/incidents`, for the older page model; this repo declares a v3
page, so the v3 endpoints are the ones that apply) and incidents in a different tool.

On the free plan this repo is on, the automation rules are refused (`403`, #2324), so incidents here are opened **by hand**.
That makes events rare and human-written, which shapes the design: there is no burst to rate-limit and no need for
second-by-second latency.

## What can be verified about Checkly

Read from the repo and from Checkly's public OpenAPI document (`https://api.checklyhq.com/openapi.json`, fetched on
2026-11-19; the repo's `@theholocron/checkly-client` has no incident calls at all today, so nothing below was exercised).

- **There is no webhook for an incident that the public document describes.** The document has no `webhooks` section.
  A status page's v3 subscriber has `type` with the single value `EMAIL`, and the subscriber payload has an `address` that
  is an email. The repo's own spec records the same ("subscribers of a status page are email addresses only, and there is no
  webhook"). Checkly's incidents page was read for this spec and mentions only email notifications. A web search suggested
  other feeds (RSS/Atom, Slack) exist on status pages; that is a secondary summary and was not confirmed in primary
  documentation, so it is **not relied on** (see "Not verified"). Checkly's _alert channels_ (the webhook that feeds `#uptime`)
  are about checks, and the public document shows nothing that routes an incident through them.
- **There is a read API.** `GET /v3/status-pages/{statusPageId}/incidents` lists incidents "most recently updated first",
  with `limit` (default 20, 1 to 100) and `nextId` for the next page. An entry has `id`, `name`, `lastUpdateStatus`,
  `duration` (seconds, null while open), `componentImpacts`, `created_at` and `updated_at`. The list item carries **no
  updates**; `GET /v3/status-pages/{statusPageId}/incidents/{incidentId}` returns the incident with `incidentUpdates` (each
  with `id`, `description`, `status`, `publicIncidentUpdateDate`, `notifySubscribers`, `created_at`), and there is
  `.../incident-updates` to list them. So catching up on changes costs one list call plus one read per incident whose
  `updated_at` moved.
- **The ids are stable and the lists are ordered by recency**, which is what a poller needs to find "what changed since I
  last looked" and to key a de-duplication marker on `(incidentId, updateId)`.
- The schema marks `created_at` and `updated_at` as `date` format, though the examples elsewhere in the document are
  timestamps. Whether they carry a time of day is **not verified**; a poller must therefore not depend on `updated_at`
  alone to decide "changed" (see "De-duplication").
- **Auth**: a bearer API key plus the `X-Checkly-Account` header, as `@theholocron/checkly-client` already does for every
  call. The key a plugin uses today is `HOLOCRON_CHECKLY_TOKEN` (fallback `CHECKLY_API_KEY`). Whether Checkly can issue a key
  that can only read is **not verified** (see "Secrets").

Conclusion for the trigger question in #2366: **polling is the only trigger that the documented API offers.** A webhook
route in Sentinel or Comlink has nothing to receive unless Checkly adds one. Designing around a webhook would be designing
around a feature the sources do not show.

## What already exists in the repo that this can reuse

- **`notifications` capability and the layout** (`.holocron/notifications.ts`). `#uptime` has `feeds: { monitoring: true }`:
  Checkly posts there through a webhook of its own whose URL goes straight to Checkly and is never stored. `#errors` has
  `feeds: { errors: true }`: Sentry's alerts arrive through the Comlink Worker. `#prs` is a forum with `feeds: { prs }`: the
  bot keeps one post per pull request. The layout is applied by `setup notifications` and compared by `doctor notifications`.
- **Posting that can be edited.** `Notifications.postMessage(channel, content)` returns `void`: it cannot hand back a message
  id, so a text message posted that way cannot be edited later. The forum methods (`ensureDiscussion`, `readDiscussion`,
  `updateDiscussion`, `postDiscussionMessage`, `readDiscussionMessages`) can find a post by key, change its first message
  and append to it, and the PR feed already de-duplicates with a footer marker (`-# ci: <sha> <conclusion>`) that is looked
  for before posting.
- **Comlink** (`apps/comlink`): a Cloudflare Worker with one route per _inbound_ source (`/sentry`), an HMAC `verify`, a
  pure `format` into an embed with pings off (`allowed_mentions: { parse: [] }`), and two bindings per source
  (`COMLINK_<SOURCE>_SECRET`, `COMLINK_<SOURCE>_WEBHOOK`). It has **no scheduled trigger, no storage and no outbound
  fetch to a third party** in the code read. It would need all three to poll (see option B).
- **Scheduled tasks** (`sync-specs`, `reconcile-projects`, `check-tokens`, `doctor-tokens`, `sync-issues`): a registry task, a
  reusable workflow in `ci/workflows/`, a thin hourly caller, and, for this repo, a heartbeat (#2359) and an entry in
  `platform.notifications.yml` so a run that errors posts to `#alerts`. GitHub delays and drops scheduled runs; the heartbeat
  periods in `.holocron/monitoring.ts` use a grace of two hours for hourly tasks for that reason.
- **Sentinel**: a webhook receiver, deployed by file upload, with a Discord bot token and the layout already read for role
  sync and the PR feed. It has no scheduler that the code shows; nothing here is triggered by Checkly.

## Goals

- An incident's opening, each update and the resolution appear in Discord, in a channel the people running the page read.
- One place per incident (or one message per incident) that is **updated**, not a growing pile of duplicates; a retry or a
  second run adds nothing.
- Nothing pings anyone (the relay's rule: `allowed_mentions: { parse: [] }`).
- A secret exists only where it is needed. The Checkly key is read-only if Checkly allows it, and the Discord credential is
  the narrowest that can do the job.
- Declared in the config like the rest of the server (layout), and compared by `doctor notifications`.

## Non-goals

- Opening or updating an incident from Discord (one direction only).
- Mirroring check failures (already `#uptime`), scheduled maintenance windows, or subscriber management.
- A public, per-component history in Discord: the status page is the record, Discord is the notice.
- Changing the status page, its rules or the plan.

## Design questions

### Trigger

| Option                                            | How                                                                                           | For                                                                  | Against                                                                                                       |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| **Poll from a scheduled workflow**                | A registry task `sync-incidents` runs a `holocron` command every 5 to 15 minutes              | The repo's own pattern; secrets stay in GitHub; no new runtime       | Latency up to the interval plus GitHub's delay; Actions minutes; GitHub drops some scheduled runs             |
| **Poll from Comlink with a Cron Trigger**         | The Worker is scheduled (a Cloudflare Cron Trigger), reads Checkly, posts through its webhook | Minute-level cadence; no Actions minutes; no bot token on the Worker | Comlink becomes a poller (it is a relay today); needs state and a Cron Trigger the deploy path may not manage |
| **Receive a webhook (Sentinel or Comlink route)** | A route per #2366's second option                                                             | Real-time                                                            | No documented sender; nothing to build until Checkly offers one                                               |
| **Do not mirror; link instead**                   | Pin the status page URL in `#uptime`; people paste incidents by hand                          | No new code, no new secret                                           | The thing #2366 asks to remove                                                                                |

### Channel

- **`#uptime`** (a text channel with the Checkly webhook): the audience is the same and an incident follows a failing check,
  so the context is together. A bot (or the Comlink webhook) can post there too. Risk: `#uptime` is a firehose during an
  outage (every check failing and recovering), and an incident message there is buried; a text message cannot be edited
  without an id (see below).
- **A new text channel** `#incidents` (read-mostly, `access: { post: [] }` like `#alerts`): quiet, so the incident stays
  visible. One more channel in the layout.
- **A forum `#incidents`** (the PR feed's shape, `kind: "forum"`, tags `investigating`, `identified`, `monitoring`,
  `resolved`): one post per incident, each update appended as a message, the tag follows the status, resolved posts are
  archived. Edits and history are native and de-duplication is the proven marker pattern. Cost: a forum takes no webhook
  (so the bot token is the credential), and a forum for a rare event is heavier than the event.

### Formatting

One embed (or, in a forum, a first message plus appended updates), with pings off:

- title: the incident's name; colour by `lastUpdateStatus` (not resolved: amber or red by impact; `RESOLVED`: green);
- fields: affected components with their impact, started at (`created_at`), and, once resolved, the duration (`duration`
  is in seconds);
- the updates, newest first, each as `STATUS, time: description`, cut to Discord's limits (the relay's `clip()` and the
  6000 character embed cap already exist as a pattern);
- a link to the status page. The page's own incident URL is **not verified** (the public document shows no URL field on an
  incident), so link to the page, not to the incident.

The description text is written by a person and is public on the page already, so it is not a leak. It can contain a mention
or a link; with `allowed_mentions: { parse: [] }` and no link previews it pings no one.

### De-duplication and edits

The key is the incident `id`; each update has its own `id`.

- **Forum (bot)**: `ensureDiscussion`/`readDiscussion` find the post by key (a footer such as `-# incident: <id>`), the first
  message is rewritten with `updateDiscussion` on any change, and a new update is appended with a footer
  `-# update: <updateId>` that is looked for first, so a rerun adds nothing. This is the PR feed's mechanism, verbatim.
- **Text channel (webhook)**: Discord lets a webhook edit a message it posted, if the caller knows the message id. The
  Comlink Worker has no storage to remember it (and a plain webhook cannot list a channel's messages to find it), so this
  needs a new binding (a key-value store) or the bot. Without either, the fallback is "post once per update" (no edit),
  which is a pile of messages per incident and is exactly what #2366 asks to avoid.
- **A cursor** is needed to avoid reading every incident each time: the newest `updated_at` seen. Since the schema says
  `date`, the poller should re-read any incident that is not `RESOLVED`, plus incidents resolved since the last run, instead
  of trusting a timestamp to the second.
- A **backfill** guard: the first run on a page that already has incidents must not post history. Open question below.

### Secrets and least privilege

| Credential                                   | Needed by                         | Notes                                                                                                                                                                           |
| -------------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A Checkly API key                            | The poller, to read incidents     | Today's `HOLOCRON_CHECKLY_TOKEN` can also write (it makes checks, pages and rules). Reading only needs a key that cannot write; whether Checkly offers one is **not verified**. |
| The bot token (`HOLOCRON_DISCORD_BOT_TOKEN`) | A forum or message-editing poster | Already in GitHub secrets for specs sync, and in Sentinel. It can post and manage threads across the server.                                                                    |
| A channel webhook URL                        | A text-channel poster             | Can post to one channel only. Cannot read or edit others'. Narrowest Discord credential, but cannot find a message to edit without an id.                                       |

The rules the repo already states apply: a secret goes only where it is needed, one writer per secret, and an organization
secret needs a named list of readers (`tech-org-secret-visibility`). Concretely:

- **Option A (workflow):** the Checkly key and the bot token must both be readable by one workflow in this repo. Both are
  `ci`-layer, repo-scoped GitHub secrets (like the heartbeat URLs). The Checkly key there is the writer-capable one unless a
  read-only key exists: a leak of the workflow's environment would let someone change the status page.
- **Option B (Comlink):** the Checkly key and the webhook URL are Worker bindings, in the `prod` layer, handed to the Worker
  by `setup notifications` (as the signing secret is). The Worker holds no bot token. That is the best privilege story, but
  it again carries the writer-capable Checkly key unless a read-only key exists.

A new Checkly token (or a second use of the one in `tokens`) follows the repo's rule for tokens: declare it with its
`expect` in the plugin's `tokens`, update `docs/src/content/docs/tokens.mdx`, the layer that holds it, and the probe
(`probe checkly token`) in the same change. Not decided here which token this is.

### Declaration (server as code)

Two shapes, with different reach:

1. **A new feed on a channel**: `feeds: { incidents: true | { status page name, ... } }`. It sits beside `feeds.monitoring`
   and `feeds.errors`. It names which status page (by the `name` already in `monitoring.statusPages`, so there is one source),
   leaves the channel's kind to the channel (`text` or `forum`), and for a forum requires the four state tags like
   `forumLayoutProblem()` does for `prs`. `setup notifications` makes the channel (and, for a text channel, the webhook);
   `forumLayoutProblem()` gains the rule.
2. **No layout change**: the task's own option (`with:`) names the channel and the page. Smaller, but then the layout and
   `doctor notifications` know nothing about it, which breaks the rule that the server is declared in one place.

Recommendation is shape 1.

`doctor notifications` would add rows next to the existing `pr-feed-*` and `monitoring` ones: the channel exists and has the
right kind and tags; the poster can post there; and, from the monitoring provider, that the declared status page exists
(`doctor monitoring` already checks it). A run that has not happened lately is a heartbeat's job (#2359), not the doctor's.

### Failure modes

| Failure                                       | Effect                     | Handling                                                                                                                     |
| --------------------------------------------- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Checkly refuses the read (`401`, `403`, plan) | Nothing posts              | A failing step with the provider's own message (`describeProviderError()`); for a 403 on a plan, a `skip` row, not a failure |
| Checkly down or slow                          | A missed run               | The next run catches up, since it reads state, not events                                                                    |
| Discord rate limit (429)                      | Run stops part way         | Stop cleanly, report what is left, the next run continues (the `sync specs` behaviour)                                       |
| Discord refuses a post                        | One incident missing       | A failing row with the incident id; the marker is not written, so the next run retries                                       |
| A duplicate (two overlapping runs)            | Two posts for one incident | Look the marker up first and de-duplicate afterwards, as `dedupeDiscussion` does for the PR feed; or serialise with a lock   |
| A scheduled run is dropped by GitHub          | Longer delay               | A heartbeat (as the other scheduled tasks have)                                                                              |
| A person edits an update on the page          | Discord shows the old text | Compare text, not only ids, so the first message is rewritten; an appended update is not rewritten (state which behaviour)   |
| An incident is deleted on the page            | The post stays             | Leave it. The repo never deletes                                                                                             |
| The first run on a page with history          | A burst of old incidents   | See the open question on backfill                                                                                            |

## Options and recommendation

**Option 0: do nothing** (link the page from `#uptime`). No work; leaves #2366 unmet.

**Option A: scheduled workflow plus the bot, into a forum (or channel) declared as a feed.** A registry task
`sync-incidents` runs `holocron sync incidents` (an optional `Monitoring.listIncidents` on the provider, the `notifications`
forum methods for the post). The PR feed's mechanisms (forum, key, marker, tag-per-state) are reused; no new runtime.

- For: smallest new surface; the pattern exists (`sync specs`, `#prs`); de-duplication is solved; `doctor notifications`
  already knows the forum rows.
- Against: latency of 5 to 15 minutes plus GitHub's delays; the Checkly key lives in GitHub secrets; a forum is heavy for rare
  events.

**Option B: Comlink polls on a Cron Trigger and posts through a webhook.** The Worker reads Checkly and posts to the channel
webhook.

- For: the best privilege split (no bot token on it); minute cadence.
- Against: Comlink becomes a poller and needs state to edit; a Cron Trigger, a storage binding and an outbound call are all
  new to the Worker and to how `setup notifications` deploys it; two secrets on the Worker (writer-capable Checkly key and
  the webhook). Without state it can only post-once, which fails the de-duplication goal.

**Option C: Sentinel.** No webhook to receive and no scheduler shown. Rejected unless Sentinel gains a scheduler for other
reasons; this spec does not ask for one.

**Recommendation (a recommendation, not a decision): Option A, into a forum declared as `feeds.incidents`, with the poll
interval and the Checkly key as the two things to settle first.** Reasons: polling is the only trigger the public API
offers; it reuses the one pattern in this repo that already solves "one place per thing, updated, de-duplicated" and the
checks that compare it with the layout; it adds no runtime to Comlink, which should stay a relay of inbound webhooks. If the
maintainer prefers a plain text channel, Option A still works with a message the bot posted and edited by id (needs a new
`Notifications` method that returns an id, because `postMessage` returns nothing), at the price of a small new capability
surface. Option B becomes attractive if Checkly later offers a webhook (then Comlink gets a `checkly-incidents` source with
`verify` and `format`, which is its design, and the poll goes away).

## Open questions (for the maintainer)

1. **Latency:** is a notice 5 to 15 minutes after the page changes acceptable, given incidents are opened by hand and
   rare? If not, option B (or a webhook, if Checkly gains one) is the only route to minutes.
2. **Channel and shape:** `#uptime` (reuse), a new text `#incidents`, or a forum `#incidents`? A forum needs the bot token and
   four state tags; a text channel needs a message-id-returning method or a store.
3. **Checkly key:** may the poller use `HOLOCRON_CHECKLY_TOKEN`, which can also write, or is a separate read-only key
   required (and does Checkly offer one for this plan)? Which layers hold it?
4. **Backfill:** on the first run, post only incidents opened after the feed is declared, only open ones, or everything?
5. **Edits to an appended update:** if a person edits an update's text on the page, should Discord show the edit (rewrite
   the appended message) or only the first message's summary?
6. **Cadence of the heartbeat:** the other scheduled tasks use a grace of two hours; is the same right for a task that runs
   every 10 minutes, or should this one have none?
7. **Plan:** on the free plan automated incidents are refused (#2324). Is it acceptable that the feed is built and tested
   against hand-opened incidents only, with the rule-opened case unverified until a paid plan?
8. **`feeds.incidents` shape:** a bare `true` that picks the only declared status page, or an explicit page name? What if
   several pages are declared?
9. **Doctor:** should `doctor notifications` also read the page's incidents and warn about one that is open for a long time
   (a different feature, not this one)?

## Not verified

- That Checkly has **no** way to push an incident (webhook, Slack or Discord subscriber, RSS-to-webhook). The public OpenAPI
  document and the incidents page show none; a web search summary mentioned RSS/Atom and Slack feeds and was not confirmed
  against primary documentation. If a Slack-format webhook subscriber exists, Discord can accept Slack-compatible webhook
  payloads at a `/slack` suffix, which would make a push route possible; this is a guess and was not tested.
- That the read API works on this account's plan, and what an incident looks like from a real hand-opened incident (no call
  was made; `@theholocron/checkly-client` has no incident methods and no live service was contacted).
- Whether `created_at` and `updated_at` have a time of day (the schema says `date`).
- Whether Checkly can issue a read-only API key, and the key's scope on the free plan.
- The URL of one incident on the public page (the document shows no URL field).
- That a webhook-posted Discord message can be edited by the same webhook (Discord's documented behaviour as I recall it, not
  checked here), and the limits on embed size beyond the 6000 characters the relay already enforces.
- That Comlink's deploy path (`setup notifications`, `Workers.deployScript`) can attach a Cron Trigger or a storage
  binding. The code read shows neither.
- Whether Sentinel has, or could cheaply get, a scheduler.
- Cadence of GitHub scheduled runs: the repo's own notes say they are delayed and dropped; no measurement was made.
