---
id: SPEC-0100
status: accepted
issue: theholocron/holocron#2366
blocked-by: []
related:
  - theholocron/holocron#2302
  - theholocron/holocron#2324
  - theholocron/holocron#2359
  - theholocron/holocron#1738
  - theholocron/holocron#1535
discussion:
  url: https://discord.com/channels/1303969001822486568/1573010026983858186
---

# Mirror status page incidents to Discord

## Problem

An incident on the status page reaches only the page's subscribers, and a subscriber is an email address. Discord hears
about a failing check (the Checkly alert channel posts to `#uptime`) but not about the incident: its title, who is
affected, what the people running the page said, and that it was resolved.

#2366 asks for the opening, the updates and the resolution of an incident to be posted to Discord. This spec is the design.
It builds nothing.

## Decided

- **Polling is the only trigger.** Checkly's webhook alert channel fires on check results only, and a status page's
  subscribers are email addresses only. Incidents are read from the REST API. There is no webhook route, no Comlink
  involvement and no Sentinel involvement.
- **The poster is the bot, into a forum.** One post per incident, edited in place, updates appended. No text-channel option.

## What an incident is here

A status page incident on the page `The Holocron` (declared in `.holocron/monitoring.ts`, #2302), opened by a person or, on
a plan that allows it, by an automation rule. It is not a failing check (`#uptime`), a Sentry issue (`#errors`) or an
Actions failure (`#alerts`). On the free plan automation rules are refused (`403`, #2324), so incidents here are opened by
hand: rare, human-written, no need for second-level latency.

## What can be verified about Checkly

From Checkly's incidents page (read 2026-11-22) and its OpenAPI document (`https://api.checklyhq.com/openapi.json`, read for
the earlier draft on 2026-11-19). Nothing was exercised against a live account.

- An incident has a name, impacted components each with an impact (`UNDER_MAINTENANCE`, `DEGRADED_PERFORMANCE`,
  `PARTIAL_OUTAGE`, `MAJOR_OUTAGE`), an initial update message, a status, an optional public date and a notify-subscribers
  box. There is no separate severity field and no maintenance object: maintenance is the "under maintenance" impact.
- **Updates are separate objects.** The OpenAPI document gives each update an `id`, `description`, `status`
  (`INVESTIGATING`, `IDENTIFIED`, `MONITORING`, `RESOLVED`), `publicIncidentUpdateDate` and `created_at`. The incidents
  page does not name the statuses; it talks about posting, editing and notifying on individual updates. Resolving closes
  the open impact phases, so resolution is an update with status `RESOLVED`, not a different object.
- `GET /v3/status-pages/{statusPageId}/incidents` lists incidents most recently updated first (`limit` 1 to 100, default 20;
  `nextId`); an item has `id`, `name`, `lastUpdateStatus`, `duration` (seconds, null while open), `componentImpacts`,
  `created_at`, `updated_at` and no updates. `GET .../incidents/{incidentId}` returns it with `incidentUpdates`.
- Auth is a bearer key plus `X-Checkly-Account`, as `@theholocron/checkly-client` already does.

Notifications by email go out only when an update is first posted; an edit resends nothing. That is Checkly's side and is not
copied: an edit to an update is shown in Discord according to "Edits" below.

## Design

### The task: `sync-incidents`

A registry task (`local: null`) with a reusable `ci/workflows/sync-incidents.yml` and a thin caller, the shape of
`reconcile-projects` and `sync-specs`; it runs `holocron sync incidents --yes`. It is listed in `tasks:` and in
`platform.notifications.yml` so a run that errors posts to `#alerts`.

- **Interval, recommended: every 15 minutes** (`7,22,37,52 * * * *`, off the top of the hour where Actions queues are
  longest). Incidents are rare and hand-written, so a notice up to a quarter of an hour late, plus GitHub's own delay, is
  acceptable. The sync is stateless (below), so a dropped run only delays.
- **Heartbeat, recommended:** `sync-incidents`, period 15 minutes, grace 1 hour (a dropped run or three does not trip it;
  the hourly tasks use 2 hours for the same reason), tag `scheduled`, declared in `.holocron/monitoring.ts` beside the
  others. The workflow ends with the same `Ping the heartbeat` step, reading `HOLOCRON_HEARTBEAT_SYNC_INCIDENTS`, which is
  a `repo.secrets.sync` key in `.holocron/repo.ts`; `load-config-heartbeats.test.ts` already checks each name has its
  secret and a workflow that reads it.
- **Concurrency:** one group, `cancel-in-progress: false`, so two runs never overlap in the normal case.

### Credentials and layers

| Credential        | Name                                                  | Layer                                                                                  |
| ----------------- | ----------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Checkly API key   | `HOLOCRON_CHECKLY_TOKEN` (fallback `CHECKLY_API_KEY`) | `ci` (added to the token's declared `layers`), a repo-scoped `repo.secrets.sync` entry |
| Discord bot token | `HOLOCRON_DISCORD_BOT_TOKEN`                          | `ci`, already synced for `sync-specs`                                                  |

The key lives in the `ci` layer's 1Password Environment and reaches GitHub only through `holocron sync secrets --env ci`;
nothing is read from the `dev` or `local` layers by the workflow. It is the same key `setup` uses, so it can also write
(checks, pages, rules). Whether Checkly issues a read-only key is not verified, so this is an open question; if it does, a
second token is declared with its `expect` in the plugin's `tokens`, the permission table in
`docs/src/content/docs/tokens.mdx` and the `probe checkly token` checks change together, as the token rules say. Whichever
token is used, a `ci` declaration of the Checkly token is added to the plugin's `tokens` in the same change.

### Capability shape

An optional method on `Monitoring`, in the vocabulary the other optional methods use (`dashboards`, `heartbeats`):

- `listIncidents(input: { statusPage: string; since?: string }): Promise<MonitoringIncident[]>`, where the page is found by
  its declared name (the one source, `statusPages[].name`).
- `MonitoringIncident`: `id`, `title`, `status` (`investigating | identified | monitoring | resolved`, from the last
  update), `impacts: { component, impact }[]` with `impact` one of `maintenance | degraded | partial | major`, `startedAt`,
  `resolvedAt?`, `durationSeconds?`, `updates: { id, status, text, at }[]` oldest first. No URL (none is verified); the
  message links the status page.
- The Checkly provider does the list-then-get itself: it reads the list (following `nextId` until an item older than
  `since` and not open), then one `get` per incident that is open or was updated since. The CLI sees only the neutral
  shape, so a move to another status page vendor is a plugin. `@theholocron/checkly-client`'s `statusPages` group gains
  `incidents.list` and `incidents.get`.

### Where it posts

A forum channel `#incidents`, declared in `.holocron/notifications.ts` with `feeds: { incidents: "The Holocron" }` (the
status page's name; a bare `true` is allowed only when exactly one page is declared). It reuses the discussion methods the
PR feed uses, with no new `Notifications` method:

- key `<status page name>#<incident id>`; `ensureDiscussion` finds or makes the post (titled with the incident's title),
  `updateDiscussion` rewrites its first message (summary: status, impacts, started, duration once resolved, a link to the
  status page) and sets the tag, `postDiscussionMessage` appends an update, `readDiscussionMessages` and
  `dedupeDiscussion(..., { refresh: true })` read and repair.
- The forum must carry five state tags (`investigating`, `identified`, `monitoring`, `resolved`, `maintenance`);
  `forumLayoutProblem()` refuses `feeds.incidents` without them. The tag follows the last update's status, except an
  incident whose impacts are all `maintenance` is tagged `maintenance` until resolved. `allowed_mentions` is empty, no
  link previews.
- `#uptime` is not used: a text message from `postMessage` returns no id and cannot be edited, and `#uptime` is a firehose
  during an outage.

### State mapping

| Checkly                          | Discord                                                                                                    |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Incident first seen              | Post made; first message is the summary; one appended message for the first update                         |
| A new update (id not yet marked) | One appended message `STATUS, time: text` ending `-# update: <updateId>`; summary and tag rewritten        |
| Update with status `RESOLVED`    | Appended like any update; tag `resolved`; the post is closed (as the PR feed closes a merged pull request) |
| Impact only `maintenance`        | Tag `maintenance`; same messages                                                                           |
| Incident deleted on the page     | The post stays; nothing is ever deleted                                                                    |

### De-duplication, edits and catching up

No database. The post's first message carries `-# incident: <id>` and each appended message `-# update: <updateId>`; both are
looked for before anything is written, so a rerun, an overlap or a retry adds nothing, and the message that a given update
produced is recovered by reading the post (as `runPrFeed()` recovers a CI line).

- **Cursor-free catch-up.** A run reads state, not events: every open incident, plus any updated within `--since` (default
  `2d`, as `sync issues`), compared with the markers in the posts. A missed run, an outage of Checkly or of Discord is made
  up by the next one; a gap longer than the window needs `--since`.
- **First run.** The same window applies: incidents older than it are never posted, so no history burst. An incident
  resolved inside the window is posted whole (opened, updates, resolved).
- **Edits.** If a person edits an update on the page, the summary (first message) is rewritten from the current data; an
  already appended update message is **not** rewritten.
- **Time.** `updated_at` is typed `date` in the schema and may have no time of day, so "changed" is decided by the update
  ids and markers, never by `updated_at` alone.

### Failure handling

| Failure                          | Handling                                                                               |
| -------------------------------- | -------------------------------------------------------------------------------------- |
| Checkly `401`/`403`              | Failing row with `describeProviderError()`; a `403` on the plan is a `skip` row        |
| Checkly down or slow             | A failed run; the next run catches up; the heartbeat covers a run that never happens   |
| Discord `429`                    | Stop cleanly, report what is left, the next run continues (the `sync specs` behaviour) |
| Discord refuses one post         | Failing row naming the incident id; no marker was written, so the next run retries     |
| Two overlapping runs             | Markers first, then `dedupeDiscussion` keeps the oldest post                           |
| Unconfigured (no feed, no token) | A quiet skip                                                                           |

### `--dry-run`

Reads Checkly and the forum, prints one row per incident with what it would do (`create post`, `append update <id>`,
`retag`, `close`, `nothing to do`), and writes nothing to Discord. It builds no `notifications` write path and does not
touch the heartbeat. `--yes` skips the confirmation; without a terminal and without `--yes` or `--dry-run` it refuses, like
`sync issues`.

### Doctor

`doctor notifications` adds `incident-feed-forum`, `incident-feed-tags` and `incident-feed-bot` rows next to the
`pr-feed-*` ones (`feeds.incidents` names a declared status page; the forum has the five tags; the bot can post and manage
threads there). `doctor monitoring` adds an `incidents` row: the page's incidents list is readable, a `403` on the plan a
`skip`. A run that has not happened lately is the heartbeat's job.

## Out of scope

- Opening, updating or resolving an incident from Discord (one direction only).
- Check failures (`#uptime`), Sentry issues, Actions failures.
- Subscriber management, notification emails, and the older v1 status page incident endpoints.
- A webhook, Comlink, Sentinel or any trigger other than polling, unless Checkly adds a push feed.
- Rewriting an already appended update message, or deleting a post when an incident is deleted.
- Rule-opened incidents on a paid plan (the code does not care how an incident was opened, but it is not tested).
- Per-component history or uptime figures in Discord.

## Plan

Small issues, in order; each ships its tests and docs.

| #   | Title                                                                                                                                                                       | Size | Needs         |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | ------------- |
| 0   | `chore(monitoring): confirm the incident API on a hand-opened incident` (a human step: open one, record the real list and get responses, key scope, `updated_at`, statuses) | S    | maintainer    |
| 1   | `feat(checkly-client): incidents list and get on statusPages`                                                                                                               | S    | 0             |
| 2   | `feat(monitoring): Monitoring.listIncidents and the Checkly provider` (type, mapping, `doctor monitoring` row, token `ci` layer and `tokens.mdx`)                           | M    | 1             |
| 3   | `feat(notifications): feeds.incidents and the five state tags` (layout type, `forumLayoutProblem()`, setup, `incident-feed-*` doctor rows)                                  | M    | none          |
| 4   | `feat(cli): renderIncident and planIncidentFeed` (pure rendering, markers, state mapping, tests)                                                                            | M    | 2             |
| 5   | `feat(cli): holocron sync incidents` (command, `--dry-run`, `--since`, 429 stop, `COMMAND_CONTEXTS`/registry, docs)                                                         | M    | 3, 4          |
| 6   | `ci: sync-incidents task, reusable, caller and heartbeat` (registry, workflow, `repo.secrets.sync`, notifications list, `.holocron/monitoring.ts`)                          | S    | 5             |
| 7   | `chore: declare #incidents in this repo's layout and run it once` (layout, `setup notifications`, a dry run then a real one)                                                | S    | 6, maintainer |

Issues 1 and 3 can start together; 5 and 6 should not be merged before 0 has confirmed the API.

## Status

Built and running (2026-11-23, #2592). The task polls every 10 minutes (not 15; question 2), with the heartbeat
`HOLOCRON_HEARTBEAT_SYNC_INCIDENTS` (10 minute period, 30 minute grace). A manual `sync incidents` run against the live
account and the `#incidents` forum worked: the post, its tag, the starter and default reactions, a rerun that changed
nothing. A manual run of the scheduled workflow on `alpha`
passed and the heartbeat recorded the ping. Creating incidents (a local command or a trigger) is out of scope here and is
tracked in #2591.

## Open questions

1. **Read-only key.** May the workflow hold `HOLOCRON_CHECKLY_TOKEN` in `ci` even though it can also write the status page,
   or is a separate read-only key needed (and does Checkly offer one)?
2. **Actions minutes.** Is a 15-minute schedule (about 96 runs a day) acceptable, or should it be 30 minutes or hourly?
3. **`maintenance` tag.** Is a fifth tag worth it, or should maintenance share `investigating`'s or `monitoring`'s tag?
4. **Paid plan.** Is it acceptable to build and test against hand-opened incidents only, leaving rule-opened ones unverified?

## Not verified

- **The list and get incident endpoints** were first read from the OpenAPI document and the incidents page. A live run
  (2026-11-23) has since read a real incident, with its updates, through them (`@theholocron/checkly-client`'s
  `statusPages.incidents`); a rule-opened incident and paging past one page are still unexercised.
- **Incident updates as separate objects:** the incidents page does not say so; only the OpenAPI document does.
- **The statuses an update can have:** not named on the incidents page; `INVESTIGATING`, `IDENTIFIED`, `MONITORING` and
  `RESOLVED` come from the OpenAPI document.
- Whether `created_at` and `updated_at` carry a time of day (the schema says `date`).
- Whether Checkly can issue a read-only key, and what the free plan's key may read.
- That the read API answers on this account's plan, and what a real hand-opened incident looks like.
- The URL of one incident on the public page (no field shows it, so messages link the page).
- That Checkly has no push feed of its own (RSS, Slack-format webhook); a web search summary mentioned some and it was not
  confirmed. The decision does not depend on it.
- GitHub's scheduled-run reliability at a 15-minute interval: no measurement was made.
- Discord's forum limits for a post's first message and appended messages beyond what the PR feed already clips.
