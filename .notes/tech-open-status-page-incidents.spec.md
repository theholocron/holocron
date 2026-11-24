---
status: draft
issue: theholocron/holocron#2591
blocked-by: []
related:
  - theholocron/holocron#2366
  - theholocron/holocron#2302
  - theholocron/holocron#2324
---

# Open status page incidents from a command or a trigger

## Problem

An incident on the status page is opened by hand in Checkly's UI. The page's automation rules would do it from a failing
check, but this account's plan answers `403` to them, so `statusPages[].automation` is `false` and the doctor says
"incidents are opened by hand". Opening one means signing in to Checkly, finding the page, picking the components and
their impact and typing the first update, usually while something is broken. `sync incidents` (SPEC-0100) then mirrors
the incident to `#incidents` within about ten minutes, so the Discord side needs nothing: the gap is only the first step.

The wish is two things: a command a maintainer runs from a terminal, and a trigger that can run it, so an incident can be
opened from a phone or by another system.

## Decision

Build the command first, then a manual trigger on top of it. Leave automated triggers (a failing check, a failed deploy)
to a later spec once the command is proven.

### The commands

Verb first, like `new issue`, `update issue` and `close work`:

| Command                                                                                          | Does                                                            |
| ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| `holocron new incident <title> [--page] [--status] [--component <name>=<impact>...] [--message]` | opens an incident with its first update                         |
| `holocron update incident <id> --status <status> --message <text>`                               | appends an update (`identified`, `monitoring`, `investigating`) |
| `holocron close incident <id> [--message]`                                                       | appends a `resolved` update                                     |

- **The page** is the status page the config declares (`statusPages`); with one declared it is the default, and `--page`
  names one otherwise. A component is a declared component's name, never an id, and its impact is one of Checkly's
  (`UNDER_MAINTENANCE`, `DEGRADED_PERFORMANCE`, `PARTIAL_OUTAGE`, `MAJOR_OUTAGE`), written in lower case with hyphens
  (`major-outage`). An unknown component or impact fails before anything is written, naming the valid ones.
- **Status** words are the incident statuses `sync incidents` already knows (`INVESTIGATING`, `IDENTIFIED`, `MONITORING`,
  `RESOLVED`), so a post's tag and the command agree.
- **Safe by default.** Each asks first unless `--yes` or `--dry-run`, and with no terminal and no `--yes` it is a
  `NonInteractiveError`. `--dry-run` prints the incident it would open and writes nothing.
- **Subscribers.** Each incident update carries `notifySubscribers`, which the API defaults to `false` (the UI announces
  an incident, the API does not unless asked). The commands send it explicitly: `true` unless `--no-notify` (the way to
  try one out), and the confirmation says whether subscribers will be told.
- **No duplicates, by title.** `new incident` reads the page's open incidents first and refuses when one has the same
  title (trimmed, lower case, spaces collapsed); `--allow-duplicate` overrides. A rerun after a timeout never opens two,
  and the same title may be opened again once the first is resolved. There is no marker in the message: Checkly shows an
  HTML comment as plain text on the public page (step 0, 2026-11-24), so a hidden marker is not hidden.
- **Provider-neutral.** The optional `Monitoring.openIncident`, `updateIncident` and `resolveIncident` take the neutral
  `MonitoringIncident` vocabulary `listIncidents` already returns, so another status page provider is a plugin and not a
  new command. The Checkly plugin implements them over `@theholocron/checkly-client`'s `statusPages.incidents`
  (new `create`, `update` calls beside `list` and `get`). A provider without them is a skipped row, never a failure.

### The trigger

A `workflow_dispatch` workflow, the registry task `open-incident` (reusable `ci/workflows/open-incident.yml`, thin caller,
`local: null`), with inputs `title`, `status`, `components`, `message` and `notify` (default true) that run
`new incident --yes`. It is manual: GitHub's Actions page, the GitHub mobile app or `gh workflow run`. It holds
`HOLOCRON_CHECKLY_TOKEN` in `ci` as `sync-incidents` does, so it can write and nothing new is granted. A run's job summary
links the incident's id for `update incident`.

Anyone who can dispatch workflows in the repository can run it, which is the maintainer alone today (decided below); it is
revisited when that stops being true. An automated trigger is out of this spec. The code does not care how the command is
reached, so a later trigger calls the same function.

## Not building

- Opening an incident from Discord (one direction only, as SPEC-0100).
- Rewriting or deleting an incident or an update. Only appending, as `sync incidents` assumes it can rely on.
- Maintenance windows (`UNDER_MAINTENANCE` as a scheduled event with a start and end). The impact word works for an
  incident; scheduling is another Checkly object.
- Making the page's automation rules work on a plan that refuses them (#2324).

## Rollout

| #   | Change                                                                                                                          | Size |
| --- | ------------------------------------------------------------------------------------------------------------------------------- | ---- |
| 0   | A human step: on a throwaway incident, confirm the create and update calls, `notifySubscribers`, and how an HTML comment shows  | S    |
| 1   | `feat(checkly-client): ✨ create and update status page incidents` (calls, types, tests)                                        | S    |
| 2   | `feat(monitoring): ✨ Monitoring.openIncident, updateIncident and resolveIncident` (capability, Checkly plugin, tests)          | M    |
| 3   | `feat(cli): ✨ new, update and close incident` (commands, `COMMAND_CONTEXTS`, registry, menu entries, docs)                     | M    |
| 4   | `ci: ✨ open-incident task` (registry, reusable, caller, `platform.notifications.yml` entry; no heartbeat, it is not scheduled) | S    |

0 comes first because every field name here is from the existing read side and the incidents page, not from a write.

## Decisions (2026-11-24)

1. **Subscribers.** Checkly's reference for opening an incident on a v3 page takes one update with `notifySubscribers`
   (default `false` in the API), so the commands send it explicitly, `true` unless `--no-notify`. Read from the
   documentation, not tried: step 0 opens a throwaway incident that does not notify and then one that does, on a page with
   a subscriber of the maintainer's own.
2. **Automated trigger.** None for now. The hard part is when to close the incident again, so it is its own spec if it is
   wanted.
3. **Who may run it.** Anyone who can dispatch workflows in the repository. The maintainer is the only one today; an
   Environment with required reviewers is revisited when that changes (it would slow an incident down).
4. **Duplicates.** First a hidden marker holding a hash of the page and the title; step 0 showed Checkly displays the
   comment as text, so the decision is now the open incidents' titles compared (above), with nothing added to the message.
5. **A key that can write.** Accepted: the `ci` key can write and no narrower key is available (SPEC-0100, open question 1).

Checkly's own CLI has `checkly incidents create` (CLI 7.5.0 and later: `--status-page-id`, `--title`, `--services`,
`--severity`, `--message`, `--no-notify-subscribers`). This is not a wrapper of it: the commands read the page and the
components from the config, speak a provider-neutral vocabulary, keep the marker, and need no second tool in the workflow.

## Not verified

- **Every write.** `@theholocron/checkly-client` has only `list` and `get` for incidents. The create and update paths, their
  bodies, the incident statuses an update may carry and the response are not exercised.
- Whether a free-plan key may create incidents at all (the rules answer `403`).
- **The create request.** From Checkly's reference, not a call: `POST /v3/status-pages/{id}/incidents` takes a `name` (at
  most 255 characters), exactly one update that opens the incident (`description`, `status`, `notifySubscribers`,
  optional `publicIncidentUpdateDate`) and an optional array of component impacts (`componentId`, `status`; a component left
  out is `OPERATIONAL`); the response (201) gives the incident's id, its last update status and its updates. The impact
  word in this spec is the API's `status` of a component impact, and the message is the update's `description`. An update
  is `POST .../incidents/{incidentId}/incident-updates` (`description`, `status`, `notifySubscribers`, optional
  `publicIncidentUpdateDate`), and a `RESOLVED` update closes the incident: there is no resolve endpoint, so `close
incident` posts one. `PUT .../incidents/{incidentId}` renames the incident and sets its component impacts. The CLI's
  `checkly incidents create` works on the older "services" model, so it refuses this page ("no services").
- **Verified in step 0 (2026-11-24):** `POST /v3/status-pages/{id}/incidents` with one `INVESTIGATING` update and no
  component impacts answers `201`; the description is stored verbatim. Whether `notifySubscribers: true` emails a subscriber is not tried.
  An HTML comment in the description shows as plain text on the public page, so no marker is used.
- Whether a created incident appears in the list `sync incidents` reads with the fields it expects (`impacts`, `updates`).
