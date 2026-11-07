---
id: ADR-0019
title: "Axiom dataset per service, split by the env tag"
status: accepted
date: 2026-11-06
owners: []
specs:
  - docs/wiki/specifications/logger.spec.md
discussion:
  url:
supersedes:
  - ADR-0012
superseded-by: []
tags: [logging, observability, axiom, environments]
---

# ADR-0019 — Axiom dataset per service, split by the env tag

- Status: accepted
- Date: 2026-11-06
- Issue: #1865 (part of #1727, follows #1678)

## Context and Problem Statement

ADR-0007 sent CI logs to `holocron-ci` and local logs to `holocron-local`, and ADR-0012 added a third dataset,
`holocron-global`, for commands that are not about any repo. Those were datasets per environment. Since #1694 and
#1696 every log line carries `env` (`local`, `development`, `ci`, `test`, `production`, from `detectEnvironment()`
in `@theholocron/env-utils`), so a query tells the environments apart inside one dataset. Separate datasets per
environment now only add resolution rules (config before chain, a hardcoded fallback), a second place to provision,
and a query that has to know which dataset to ask.

## Decision Drivers

- The `env` field already carries the distinction the per-environment datasets were made for.
- A service is the unit people debug, so a service's lines belong together.
- A global-context command's lines must still not depend on `$PWD` or on which repo's configuration is active.
- Local runs stay opt-in: nothing ships unless both a token and a dataset resolve.
- Keep the `HOLOCRON_` prefix chain (`HOLOCRON_AXIOM_DATASET`, then `AXIOM_DATASET`).

## Considered Options

- **A. A dataset per environment.** Rejected: it duplicates what `env` says and keeps the special cases.
- **B. One dataset for the whole ecosystem.** Rejected: services with different shapes and volume would share a
  dataset and a retention window, and "which service" would become a filter on every query.
- **C. A dataset per service, split by `env`; `log.axiom.dataset` stays a per-repo override that a global-context
  command ignores.** Chosen.

## Decision Outcome

Chosen option: **C**, the smallest change that keeps the goal of ADR-0012 (a global command never takes its dataset
from the repo it runs in) without a dataset of its own.

| Service      | Dataset             | Variable                 | State                                                       |
| ------------ | ------------------- | ------------------------ | ----------------------------------------------------------- |
| Holocron CLI | `holocron`          | `HOLOCRON_AXIOM_DATASET` | read by the CLI                                             |
| Sentinel     | `holocron-sentinel` | `SENTINEL_AXIOM_DATASET` | Sentinel still reads `AXIOM_DATASET` today (#1875 moves it) |
| Comlink      | `holocron-comlink`  | `COMLINK_AXIOM_DATASET`  | reserved: Comlink does not log to Axiom yet                 |

`AXIOM_ORG` is one shared value. The bare `AXIOM_DATASET` stays a documented fallback for the CLI (the vendor-native
name), and the 1Password Environment no longer syncs it; `HOLOCRON_AXIOM_DATASET` is synced instead and the sync
workflows pass `HOLOCRON_AXIOM_DATASET: ${{ vars.HOLOCRON_AXIOM_DATASET }}` with no fallback.

- `holocron-ci`, `holocron-local` and `holocron-global` are retired. `GLOBAL_AXIOM_DATASET` is removed from the CLI.
- Resolution order is unchanged for a command that is about a repo: process environment, `log.axiom.dataset`, the
  credential chain. The config no longer exists to keep local runs off the CI dataset; it is a plain per-repo
  override.
- A `global`-context command skips `log.axiom.dataset` (it has no repo), and otherwise resolves like any other
  command, so it lands in the CLI's dataset with its `command` field and `env`. This repo's `.envrc` and its
  `log.axiom.dataset` are removed.
- `holocron repo setup` provisions the CLI's dataset (`holocron`) as it resolves from the environment, and skips the
  step when none does.
- Local runs stay opt-in: nothing ships without a token and a dataset.

### Retention

A dataset has a single retention setting, configured in Axiom and not by Holocron, so a service's environments share
it. The retention suggested in the logger spec (90 days for CI, 7 days for local) no longer applies as two numbers.
The trade-off: a window long enough for CI and production keeps local and development noise as long, and a short
window to save storage would also cut the lines that correlate with releases and incidents. This ADR does not set a
value; the window is chosen in Axiom, and the `env` tag is the way to find or trim a class of lines. Whether Axiom
can age out lines by field inside one dataset has not been checked, and nothing here relies on it.

### Positive Consequences

- One dataset to provision and query per service, with the environment as an ordinary filter.
- The fallback dataset and the config-before-chain rule are gone from the resolver.

### Negative Consequences

- No per-environment retention (above).
- A line from a laptop sits beside production lines in the same service's dataset; queries must filter by `env`.

## What this changes in earlier ADRs

- **ADR-0012** is superseded: its dedicated global dataset is gone. Its premise that a global command must not take
  the repo's dataset stays, as the rule that such a command ignores `log.axiom.dataset`.
- **ADR-0007** stays accepted. Only its statement that the dataset differs per environment (`holocron-ci`,
  `holocron-local`) no longer holds.

## References

- Issue #1865, epic #1727, observability work #1678 (#1694, #1696)
- `docs/src/content/docs/logging.mdx`, "One dataset per service, every environment"
- `docs/wiki/specifications/logger.spec.md`
