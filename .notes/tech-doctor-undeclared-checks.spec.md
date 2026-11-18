---
id: SPEC-0096
status: draft
issue: theholocron/holocron#2365
blocked-by: []
related:
  - theholocron/holocron#2302
discussion:
  url: https://discord.com/channels/1303969001822486568/1572636372710334617
---

# `doctor monitoring` names a check that no config declares

## Problem

`holocron doctor monitoring` compares what the config declares with what the account holds, and it never looks the other
way: a check on the account that no config declares is ignored, on purpose, because the account may hold checks made by
hand or by another tool. That is right for a check nobody looks at. It is wrong for one that a dashboard or a status page
shows: a check made in Checkly's UI that carries a component's tag (`sentinel`, `docs`) is counted in that component's
status, and nothing in the repo says it exists. If it fails, the page goes red for a reason the config cannot explain; if
it is deleted, nothing notices.

## Design

### What the row says

One more `doctor monitoring` row, `monitoring-undeclared`, an `info` row (shown as skipped, never a failure, like the
other `info` rows): the account's API checks that carry a tag some declared dashboard or status page component picks
checks by, and that no config declares. The detail names each one with its tags, for example
`2 check(s) a declared dashboard or component picks up, declared nowhere: Docs staging (docs), Old relay (comlink)`.
No such check is `ok`, with the count of checks compared. A check that carries none of those tags is not reported: the
account's other checks stay its own business.

### What counts as declared

A check is declared when any config of the repository declares a check of that name (`ensureCheck` finds a check by its
name, so a name is the identity). The root config declares the Docs check; `apps/sentinel` and `apps/comlink` declare
theirs in their own configs, because a check stays with the service that owns its hostname. A root run therefore needs the
union of every workspace package's declared checks, dashboards and status page components, or it would call Sentinel's
and Comlink's checks undeclared.

`readWorkspaceMonitoring()` (`commands/workspace-monitoring/`) finds the packages the way `workspaceProviders()` does
(`readWorkspacePackages()`, a `holocron.config.*` in the package) and, for each, loads its config and builds a
`PluginLoader` over it, then reads `checks`, `dashboards` and `statusPages` from the `monitoring` capability. It reads the
capability, not a provider option, so the command knows no vendor's option names. Only the declarations are read: the
plugin is loaded, no token is read and nothing is asked of the provider. `workspaceProviders()` and this function share
one `readWorkspaceConfigs()` for the package walk.

### Which checks are compared

The root provider's `listChecks()` (the same read the checks row makes, so no extra request) returns the account's API
checks. The tags a declared dashboard or status page component picks by (`MonitoringDashboardInput.tags`,
`MonitoringStatusComponentInput.tags`, from the root and every package) are the set to look for; a check whose tags
share one with that set and whose name no config declares is reported. Heartbeats are not compared: `listChecks()` leaves
them out, and a heartbeat is not a component's check.

### When a package's config cannot be read

A package whose config fails to load, or whose provider fails to build, makes "declared nowhere" unknowable, since the
check may be declared there. The row is then a skip that names the package and says the comparison was not made, and
the checks row and the others run as before. It is never a failure and never a guess.

## Choices to review

1. **Read the `monitoring` capability of each package, not a raw `checks` option.** The command stays provider-neutral
   and a provider that builds its declared list another way still works. The cost is loading one plugin per package.
2. **Report by tag overlap, not every undeclared check.** The account may hold other checks on purpose; only the ones the
   dashboard and the page count are a surprise. The cost is that a check with no component tag stays invisible.
3. **`info`, not `fail`.** A hand-made check is sometimes right, and the doctor's other `info` rows set the precedent. A
   `--strict` that fails on `info` rows is a separate decision.
4. **Name is the identity.** A check renamed in the UI becomes undeclared and its declared name becomes missing; both
   rows say so, which is the truth.

## Out of scope

Deleting or adopting an undeclared check (setup never deletes), heartbeats and other capabilities' accounts, and a
`--strict` flag for `info` rows.

## Tests and docs

Unit tests with fake providers: every check declared across the packages is ok; an undeclared check with a component's
tag is named; one with no such tag is not; a check declared only in a package config is not reported from the root; a
package that cannot be read makes the row a skip that names it; a provider without `listChecks` makes no row. Docs in
`commands/doctor-monitoring.mdx` and `AGENTS.md`.
