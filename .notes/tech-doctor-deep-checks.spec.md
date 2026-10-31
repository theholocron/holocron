---
status: proposed
issue: theholocron/holocron#1110
blocked-by: []
related:
  - theholocron/holocron#1162
  - theholocron/holocron#1109
  - theholocron/holocron#1108
  - theholocron/holocron#1145
  - theholocron/holocron#1166
---

# Doctor: deep checks for every capability

## Problem

`holocron doctor` is the shallow check: one smoke test per provider. `holocron doctor notifications` (#1109) is the deep one: it compares what the config declares with what exists, one row per step, read-only. The same comparison is useful for other capabilities (Actions variables, secrets, monitoring, repo settings, DNS, environments), but each one written by hand would copy the renderer and drift from the others.

## The rule (from #1110, unchanged)

- `holocron doctor` is shallow and gains no new failure modes or required tokens.
- `holocron doctor <capability>` is deep: declared state against real state, one row per step, non-zero exit on a failure, never changes anything.
- `holocron doctor --all` runs every deep check, prints one row per check and one closing `N ok, N fail, N skipped`, and exits non-zero on any failure.
- A check that cannot run because its token or provider is missing is a visible skip with the reason. It is not a failure of `--all`.
- Checks that write and read back (delivery proofs) are probes (#1166), not doctor.

## Design

### A row, a renderer, a summary

`cli/cli/src/commands/doctor-checks/` holds the pieces every deep check shares:

- `CheckRow`: `{ id, title, status: "ok" | "fail" | "skip", detail, problems }`. `problems` is one line per thing that is wrong.
- `printCheckRows(rows, print)`: one `statusRow` per row with titles padded to the widest, each problem on its own indented line.
- `printCheckSummary(summary, print)`: a blank line, then `N ok, N fail, N skipped`.
- `summariseChecks(rows)`: the counts.
- `declaredVsActual(declared, actual, options)`: compares a declared map with an actual map and returns the problem lines (`missing`, `unexpected`, `declared X, found Y`). A new check is then a list of `{ title, declared, actual }` pairs, not a new renderer.

### A registry

`cli/cli/src/commands/deep-checks/` holds `DEEP_CHECKS`, one entry per `doctor <name>`:

```ts
interface DeepCheck {
  name: string; // the subcommand: "notifications"
  capability: CapabilityKey; // what it covers
  command: CommandModule; // how `doctor` registers it
  run(input): Promise<DeepCheckOutcome>; // how `doctor --all` runs it
}
```

`doctor`'s builder registers every entry's `command`, and `doctor --all` (a later step) runs every entry's `run`. A test fails when an entry has no `COMMAND_CONTEXTS` or `COMMAND_REGISTRY` entry, so adding a check is a list entry plus those two. A test that fails when a capability has a `setup` step and no check comes with `doctor --all`, once the first few checks exist.

### Decisions

- **`--built-only` stays notification-only.** It exists because of the not-built steps in #1098. No other check has a not-built step, so it is not offered elsewhere.
- **`--all` is the deep checks, not shallow plus deep.** The "Decision" section of #1110 says so; the epic's goal line says "runs the shallow check and every deep one". Plain `doctor` is already the shallow check and stays a separate command, so `--all` does not repeat it. If a single run of both is wanted, that is a later `--all --shallow`, not a change to the meaning.
- **`--strict`** (skips become failures) is out of scope until a scheduled run needs it.

## Rollout

1. The shared helpers and the registry; `doctor notifications` moves onto them with its tests unchanged (this step).
2. `secrets list` (#1145).
3. `doctor variables` (#1433). It reads through the optional `Source.listVariables` and `listOrgVariables`; a missing token is a `MissingTokenError`, which a check reports as a skip rather than a failure.
4. `doctor --all`, the skip rule, and the `doctor (everything)` menu entry.
5. `doctor secrets`, then `doctor tokens`.
6. `doctor monitoring`, `doctor repo`, `doctor dns`, `doctor environments`.
7. The Checkly feed and Comlink relay checks (they need live credentials and the deployed Worker).

## Not in scope

The opt-in delivery checks (post and read back) are probes (#1166). `analytics`, `errors` and `logs` have no declared state to compare.
