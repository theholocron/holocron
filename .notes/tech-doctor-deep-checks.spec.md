---
id: SPEC-0057
status: proposed
issue: theholocron/holocron#1110
blocked-by: []
related:
  - theholocron/holocron#1162
  - theholocron/holocron#1109
  - theholocron/holocron#1108
  - theholocron/holocron#1145
  - theholocron/holocron#1166
discussion:
  url: https://discord.com/channels/1303969001822486568/1566618562536149073
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
4. `doctor --all` (#1435), the skip rule, and the `doctor (everything)` menu entry. Done. Inside `--all` the notifications check runs as `--built-only` so it posts nothing, and a run that could verify nothing (no provider, no layout) is a skip there, where `doctor notifications` alone fails.
5. `doctor secrets` (#1438): done. It expects `repo.secrets` plus what the config implies (the notification layout's secrets, a Chromatic token), checks names only, and never flags a secret that is not listed. `repo.secrets.sync` (#1162) declares the vault environments `secrets sync` fills from (`{ environment, keys?, scope? }`), so the doctor also expects their keys: the vault is asked only for key names (the provider's `readEnvironment` result is reduced to its keys and the values dropped), an entry with `keys` needs no vault, and an entry the vault cannot resolve is a skipped row with the reason. `secrets sync` itself still takes its environment, allowlist and scope from the command line. `doctor tokens` (#1440): done. It asks each configured plugin for its `tokens` (the GitHub plugin lists its nine), finds each as the plugin does and verifies it with `verifyToken`. A token that is not set is a skip. Scopes are not checked, because GitHub does not return a fine-grained token's permissions. Expiry (#1162): the GitHub plugin reads the `github-authentication-token-expiration` header from its `/user` call (the REST client gained an optional per-request `onResponse(headers)` hook) and returns it as `expiresAt` on `VerifyTokenSuccess`. `doctor tokens` shows `expires in N days`, and a token with 7 days or fewer left (`TOKEN_EXPIRY_WARN_DAYS`) fails its row with `expires in N days: renew it`. `CheckStatus` stays ok/fail/skip: a warning is a fail with a clear message, because only a failure turns a scheduled run red. The `security.tokenExpiry` task runs it daily from CI (daily because a weekly run can straddle the 7-day window), with the nine GitHub token secrets passed to the job as environment variables.
6. `doctor environments` (#1443): done. It expects the environments `repo setup` creates plus those `repo.secrets.environments` names. All of step 6 is done.
   `doctor monitoring` (#1452): done. It compares the provider's declared `checks` (by name, plus the URL, method, frequency, locations, activated, should-fail, body and assertions the config states) with the optional `Monitoring.listChecks`; a check in the account that is not declared is never a problem. The alert channel is not here: its subscriptions follow the notification layout, so that stays with `doctor notifications`. Still to come: `doctor repo`, `doctor dns`, `doctor environments`.
   `doctor dns` (#1451): done. It checks the records the config makes setup write that can be read without writing (the preview domain's CNAMEs, the docs host, the relay placeholder).
   `doctor repo` (#1454): done. It compares the groups `repo setup` writes through `source` (description and homepage, default branch and merge settings, topics, custom properties, labels, team access, the default-branch ruleset, security toggles) through new optional `Source` reads: `getRepoInfo`, `getProperties`, `listLabels`, `listTeamAccess`, `getRulesetDetail`, `getSecurity`. Pages, classic branch protection and the dependency graph are not read.
7. The Checkly feed and Comlink relay checks (they need live credentials and the deployed Worker): done as steps of `doctor notifications` (#1458, spec `tech-doctor-relay-checks`). They are read-only, so they run under `--built-only` and `doctor --all`; a live run with real credentials is the maintainer's acceptance step.

## Not in scope

The opt-in delivery checks (post and read back) are probes (#1166). `analytics`, `errors` and `logs` have no declared state to compare.
