---
id: ADR-0012
title: "Axiom dataset scoping: execution context over blanket local/CI"
status: proposed
date: 2026-10-08
owners: []
specs: []
discussion:
  github:
supersedes: []
superseded-by: []
tags: [logging, observability, axiom, execution-context]
---

# ADR-0012 — Axiom dataset scoping: execution context over blanket local/CI

## Status

Proposed

## Context

ADR-0007 set `HOLOCRON_AXIOM_DATASET` to one value in CI (`holocron-ci`, an org
secret) and one value locally (`holocron-local`), on the assumption that "local
vs. CI" was the only axis that mattered. That assumption breaks down once the
CLI is used to operate on more than one repo, and once "which repo" and "is
this command even about a repo" are pulled apart:

1. **Per-repo, not per-machine.** Holocron is a CLI meant to be installed into
   other repos (`rando`, future consumers). A developer running `holocron
deploy` from inside `rando` on their laptop and `holocron deploy` from inside
   `holocron` on the same laptop are both "local" — but the resulting logs
   belong to two different projects. A single machine-wide
   `HOLOCRON_AXIOM_DATASET` (shell profile, `.zshrc`) can't express that; it
   would ship `rando`'s logs to `holocron-local` or vice versa depending on
   whichever repo set it last. `direnv` (per-directory env, walks up
   subdirectories — unlike `dotenv`'s `cwd()`-only lookup) is the natural fit:
   each repo's `.envrc` sets its own `HOLOCRON_AXIOM_DATASET`.

2. **Some commands aren't "about" any repo at all.** `holocron clone`,
   `holocron new`, `holocron auth set`, `holocron upgrade node`, `holocron
plugin create` are tagged `global` in `COMMAND_CONTEXTS`
   (`packages/cli/src/commands/contexts.ts`, ADR/spec `tech-cli-execution-contexts`
   #576) — they work from a bare global install with no `holocron.config` in
   sight. A bug in `holocron clone` itself is a holocron-CLI bug; it has
   nothing to do with whatever repo happens to be in `$PWD` (if any) when the
   command was run, and nothing to do with whichever repo's `.envrc` happens
   to be active. Shipping that log line to a per-directory dataset is not just
   unhelpful, it can be actively wrong — a `global` command run from inside
   `rando` would file a holocron-CLI-internal bug under `rando`'s logs.

3. **The `deploy` boundary case.** `holocron deploy` (tagged `workspace`) is
   where this gets genuinely ambiguous: if the deploy _fails because the
   target repo's code is broken_, that belongs in the target repo's own
   dataset — a `rando` maintainer debugging a bad deploy should find it in
   `rando`'s logs. But if the deploy job _itself_ throws because of a defect
   in holocron's own capability implementation (a bad API call, an unhandled
   response shape), that is a holocron-CLI bug and arguably belongs to
   holocron's own project regardless of which repo triggered it. This ADR
   does not attempt to split failures _within_ one command by cause — see
   "Not solved by this ADR" below — but the `global` vs. `repo-aware`/
   `workspace` split already answers the clean 80% of cases without needing
   that finer distinction.

4. **A precedent already exists and already solves the "tool-owned by
   default" half of this.** `packages/cli/src/telemetry/resolve.ts`'s
   `resolveDsn()` resolves Sentry's DSN as `HOLOCRON_SENTRY_DSN` →
   `SENTRY_DSN` → `FALLBACK_DSN`, where `FALLBACK_DSN` is a hardcoded,
   ingest-only DSN pointing at **holocron's own Sentry project**. A CLI-
   internal error reports to holocron's own project by default, from any cwd,
   unless a consumer repo explicitly overrides with its own DSN. Axiom's
   dataset resolution (`resolveCliAxiom` in `packages/cli/src/logger.ts`) has
   no equivalent fallback — without an active dataset env var it silently
   fails `whoami()` (surfaced live by `holocron doctor` as `✗ logs via axiom
… needs a dataset`) instead of defaulting anywhere.

## Decision Drivers

- A `global`-context command's logs must never depend on `$PWD` or which
  repo's `.envrc` happens to be active — correctness, not just convenience.
- Per-repo log separation (`rando` vs. `holocron`) must not require a
  machine-wide env var that silently stops being correct the moment a second
  repo is checked out.
- Reuse an existing, already-shipped precedent (Sentry's `FALLBACK_DSN`)
  rather than inventing a second mechanism for the same shape of problem.
- No new capability-model concept — `logs` stays env-var-activated per
  ADR-0007; only _which_ env value gets consulted changes, and only for
  `global` commands.

## Considered Options

- **A. Keep one blanket env var, document the CI/local split as "good
  enough."** Status quo. Rejected — this is the thing #2 and #3 above show is
  actively wrong, not just imprecise, once `rando` exists as a second
  consumer.
- **B. Set `HOLOCRON_AXIOM_DATASET` in each repo's shell profile /
  `.bashrc`.** Rejected — not per-directory; the moment two repos are
  checked out on one machine, whichever repo's profile line ran last wins
  for every other repo too.
- **C. `direnv`-driven per-repo dataset for every command, no exception for
  `global` commands.** Rejected — reintroduces problem #2: a `holocron
clone` bug would file under whatever repo's `.envrc` happens to be active in
  the terminal it was run from, which is either the wrong project or
  arbitrary (clone is often run _outside_ any repo's directory at all).
- **D. Mirror the Sentry `FALLBACK_DSN` precedent: `global`-context commands
  always use a hardcoded holocron-owned dataset; `repo-aware`/`workspace`
  commands use the per-directory (`direnv`-driven) env var.** Chosen.

## Decision Outcome

Chosen option: **D**, because it reuses a pattern this codebase has already
built, tested, and shipped for exactly this shape of problem (Sentry), and it
maps directly onto a categorization (`COMMAND_CONTEXTS`) that already exists
for an unrelated reason (#576) — no new taxonomy to invent or keep in sync.

### Mechanism

- `packages/cli/src/logger.ts`'s `resolveCliAxiom()` gains the active command
  name (already threaded through as `opts.command` in `buildCliLogger`) and
  resolves it through `contextForCommand()`
  (`packages/cli/src/commands/contexts.ts`).
  - `contextForCommand(command) === "global"` → always resolve to a new
    hardcoded `FALLBACK_AXIOM_DATASET` (+ the existing holocron-owned
    ingest token path), ignoring `HOLOCRON_AXIOM_DATASET` / `AXIOM_DATASET`
    / `config.log.axiom.dataset` entirely. Same shape as
    `telemetry/resolve.ts`'s `FALLBACK_DSN` — a holocron-owned, ingest-only
    credential checked into the resolver, not read from the environment.
  - `contextForCommand(command)` is `"repo-aware"`, `"workspace"`, or
    `undefined` (unknown command) → unchanged existing chain: env vars first,
    then `holocron.config`'s `log.axiom.dataset`.
- Each repo that wants per-repo local logging (starting with `holocron`
  itself, then `rando` once it exists) gets a `.envrc` setting
  `HOLOCRON_AXIOM_DATASET=<repo>-local`, loaded by `direnv` — walks up from
  any subdirectory, unlike `dotenv`'s `process.cwd()`-only lookup, so it
  stays correct when a command is run from a nested package directory. CI
  keeps its existing org-secret `holocron-ci` value, set in the workflow
  environment rather than `.envrc` (`direnv` is a local-shell concern only).

### Positive Consequences

- `global` commands are correct by construction — no cwd/env-dependent
  routing to get wrong.
- Per-repo local log separation becomes possible without any shell-profile
  surgery or risk of one repo's setting leaking into another's session.
- Zero new infrastructure: `FALLBACK_AXIOM_DATASET` is one constant beside
  the existing `FALLBACK_DSN` / `FALLBACK_POSTHOG_PROJECT_TOKEN` in
  `telemetry/resolve.ts`'s pattern; `COMMAND_CONTEXTS` already exists and is
  already imported by `doctor.ts` for an unrelated purpose.

### Negative Consequences

- Does not resolve the `deploy`-style boundary case from Context point 3 — a
  `workspace` command's failure still files under the target repo's dataset
  even when the root cause is a holocron-CLI defect, not the target repo's
  code. Explicitly out of scope; see below.
- Adds one more env-var precedence rule a contributor has to know about when
  debugging "why didn't my log line show up in dataset X" — mitigated by
  `holocron doctor`'s `logs` row already surfacing which dataset is active.

## Not solved by this ADR

- **Splitting one `workspace` command's failures by root cause** (target
  repo's code vs. holocron's own implementation) is out of scope. The
  `global`/`repo-aware`/`workspace` split answers "which commands are never
  about a repo," not "which specific failure inside a repo-scoped command was
  actually the CLI's fault." That would need per-call-site tagging inside
  each capability implementation, not a per-command default — a materially
  bigger change, deferred until (if ever) it's shown to matter in practice.
- **`.envrc` setup for `holocron` itself** is implementation, tracked in the
  issue this ADR links to, not a design decision.

## References

- Issue: #966 (implementation)
- Prior art: `packages/cli/src/telemetry/resolve.ts` (`FALLBACK_DSN`)
- `COMMAND_CONTEXTS`: `packages/cli/src/commands/contexts.ts`, spec
  `tech-cli-execution-contexts` (#576)
- Supersedes the local/CI-only framing in ADR-0007's "Capability model —
  `errors` and `logs`" section (dataset resolution, not the rest of that
  ADR)
- `direnv`: https://direnv.net
