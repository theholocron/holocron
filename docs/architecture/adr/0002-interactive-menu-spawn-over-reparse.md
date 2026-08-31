---
id: ADR-0002
title: "Interactive CLI menu — spawn over re-parse"
status: accepted
date: 2026-08-27
owners: []
specs:
  - .notes/tool-interactive-cli-menu.spec.md
discussion:
  github:
supersedes: []
superseded-by: []
tags: [cli, interactive-menu, architecture]
---

# Interactive CLI menu — spawn over re-parse

* Status: accepted
* Date: 2026-08-27

## Context and Problem Statement

The interactive CLI menu collects a command and any missing positionals from
the user, then needs to execute the selected handler. Two approaches were
evaluated for how to hand control from the picker to the command.

## Decision Drivers

* No re-entrancy risk from triggering the default (`$0`) picker again
* Telemetry and middleware must start fresh for the sub-command
* Global flags (`--token`, `--org`, `--cwd`, `--dry-run`) must be preserved
* Control flow must be simple to reason about

## Considered Options

* **`yargs.parse([command, ...args])`** — call back into Yargs' own pipeline with synthesized argv
* **`child_process.spawn`** — spawn a new `holocron` process with the resolved argv

## Decision Outcome

Chosen option: **`child_process.spawn`**, because it eliminates re-entrancy
risk entirely and keeps the picker and the sub-command as two independent,
self-contained process invocations.

### Positive Consequences

* No re-entrancy guard needed — the child is a plain top-level invocation
* Telemetry starts fresh in the child, identical to a direct invocation
* Global flags forwarded explicitly; no implicit shared state
* Simpler mental model: picker terminates, command runs independently

### Negative Consequences

* Slight process-startup overhead for each command invocation via the menu
* Global flags must be explicitly forwarded — any new global flag needs a corresponding forwarding update in the menu code

## Pros and Cons of the Options

### `yargs.parse([command, ...args])` (re-parse)

* Good, because all middleware re-runs automatically — nothing to forward explicitly
* Bad, because the `$0` default command lives in the same pipeline; a second no-args parse triggers the picker again
* Bad, because a re-entrancy guard (`let launchedViaMenu`) becomes implicit shared state threaded through the middleware stack

### `child_process.spawn`

* Good, because no re-entrancy risk — the child process is a plain top-level invocation
* Good, because tokens come from keyring/env/config in the child, same as any direct invocation
* Good, because the parent exits cleanly once the child exits — seamless UX
* Bad, because global flags must be forwarded explicitly to the child argv
