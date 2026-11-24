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
  `NonInteractiveError`. `--dry-run` prints the incident it would open and writes nothing. Subscribers are told when the
  page notifies them, so the confirmation names that.
- **No duplicates.** `new incident` reads the page's open incidents first and refuses when one has the same title
  (`--allow-duplicate` overrides), because a rerun after a timeout would otherwise open two.
- **Provider-neutral.** The optional `Monitoring.openIncident`, `updateIncident` and `resolveIncident` take the neutral
  `MonitoringIncident` vocabulary `listIncidents` already returns, so another status page provider is a plugin and not a
  new command. The Checkly plugin implements them over `@theholocron/checkly-client`'s `statusPages.incidents`
  (new `create`, `update` calls beside `list` and `get`). A provider without them is a skipped row, never a failure.

### The trigger

A `workflow_dispatch` workflow, the registry task `open-incident` (reusable `ci/workflows/open-incident.yml`, thin caller,
`local: null`), with inputs `title`, `status`, `components`, `message` that run `new incident --yes`. It is manual: GitHub's
Actions page, the GitHub mobile app or `gh workflow run`. It holds `HOLOCRON_CHECKLY_TOKEN` in `ci` as `sync-incidents`
does, so it can write and nothing new is granted. A run's job summary links the incident's id for `update incident`.

An automated trigger is out of this spec (see Open questions). The code does not care how the command is reached, so a
later trigger calls the same function.

## Not building

- Opening an incident from Discord (one direction only, as SPEC-0100).
- Rewriting or deleting an incident or an update. Only appending, as `sync incidents` assumes it can rely on.
- Maintenance windows (`UNDER_MAINTENANCE` as a scheduled event with a start and end). The impact word works for an
  incident; scheduling is another Checkly object.
- Making the page's automation rules work on a plan that refuses them (#2324).

## Rollout

| #   | Change                                                                                                                             | Size |
| --- | ---------------------------------------------------------------------------------------------------------------------------------- | ---- |
| 0   | A human step: confirm the create and update endpoints, the fields they take and what a subscriber is sent, on a throwaway incident | S    |
| 1   | `feat(checkly-client): ✨ create and update status page incidents` (calls, types, tests)                                           | S    |
| 2   | `feat(monitoring): ✨ Monitoring.openIncident, updateIncident and resolveIncident` (capability, Checkly plugin, tests)             | M    |
| 3   | `feat(cli): ✨ new, update and close incident` (commands, `COMMAND_CONTEXTS`, registry, menu entries, docs)                        | M    |
| 4   | `ci: ✨ open-incident task` (registry, reusable, caller, `platform.notifications.yml` entry; no heartbeat, it is not scheduled)    | S    |

0 comes first because every field name here is from the existing read side and the incidents page, not from a write.

## Open questions

1. **Subscribers.** Does creating an incident through the API notify the page's subscribers as the UI does, and can it be
   turned off per incident? This decides whether `--yes` in the workflow is safe or needs a `--no-notify`.
2. **Automated trigger.** Is a failing check the right start (Checkly's own rule is unavailable, so a Sentinel or Comlink
   path would read the failure), or a failed `deploy-sentinel` or `check-preview`? Each needs a rule for when it closes the
   incident again, which is the hard part, so it is its own spec.
3. **Who may run it.** The workflow is open to anyone who can dispatch workflows in the repository. Is that enough, or does
   it need an Environment with required reviewers (which would slow an incident down)?
4. **Title as the key.** Is the title enough to tell a duplicate, or should the command write a hidden marker into the first
   update as `sync ideas` does for issues?
5. **A key that can write.** The `ci` Checkly key can write (SPEC-0100, open question 1: no narrower key is available);
   the workflow now uses that write on purpose. Is that still accepted?

## Not verified

- **Every write.** `@theholocron/checkly-client` has only `list` and `get` for incidents. The create and update paths, their
  bodies, the incident statuses an update may carry and the response are not exercised.
- Whether a free-plan key may create incidents at all (the rules answer `403`).
- Whether a created incident appears in the list `sync incidents` reads with the fields it expects (`impacts`, `updates`).
