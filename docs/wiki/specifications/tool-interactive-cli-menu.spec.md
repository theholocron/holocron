---
status: accepted
issue: theholocron/holocron#438
blocked-by: []
---

# Interactive CLI menu — no-args and missing-positional fallback

Replace every "run --help to see commands" dead end with an interactive
prompt. When `holocron` is invoked without a command, a required subcommand,
or a required positional argument, the CLI presents a searchable menu and
continues without exiting.

---

## Motivation

The CLI used to fail loudly when a user forgot an argument:

```
$ holocron
Run `holocron --help` to see available commands.
[exit 1]
```

The user then ran `--help`, scanned the command list, memorized or copied the
one they wanted, and re-invoked. Three round-trips for what a single
interactive prompt handles in one.

This failure mode appears at three levels:

- **Top level** — `holocron` with no command
- **Parent commands** — `holocron skills`, `holocron auth`, `holocron upgrade`
  with no subcommand
- **Leaf commands** — `holocron deploy` or `holocron secret set` with the
  required positional missing

Each was a dead end. The fix is the same pattern `new` and `plugin create`
already used: detect the gap, prompt for what is missing, continue.

---

## Goals

- Zero dead ends — no invocation of `holocron` exits with a "run --help"
  error in a TTY. Every missing piece is filled interactively.
- Searchable command picker at the top level — users type to filter the full
  command surface; arrow keys still work.
- Same picker pattern for parent-command subcommand selection (small lists
  use a plain scrollable select).
- Missing required positionals prompted inline, using the same
  `@inquirer/prompts` patterns already established in `new` and
  `plugin create`.
- No behavior change when all required args are supplied via CLI flags — the
  interactive path is purely a fallback.
- One new dependency: `@inquirer/search` for the searchable autocomplete.
  Everything else uses the existing `@inquirer/prompts`.

## Non-goals

- Fuzzy-matching for mistyped command names (e.g., `depoly → did you mean
deploy?`). Yargs `.strict()` already handles unknown commands with a clear
  error; that path is unchanged.
- Interactive fallback for optional positionals or required **options**
  (`deploy --project-id`, `publish --initial`) — only required positionals
  that would otherwise cause a hard failure.
- Persistent command history or abbreviation expansion.

---

## UX flows

### Layer 1 — `holocron` with no command

```
$ holocron
? What would you like to do? ›
  Type to search commands
────────────────────────────────────────────────
❯ auth            Manage bootstrap credentials in the OS keyring
  bump-versions    Bump all non-private package versions in lockstep …
  cleanup-preview  List and delete Cloudflare Pages preview deployments …
  clone            Clone all repos in a GitHub org as siblings under a directory
  config show      Print the resolved holocron config
  deploy           Trigger a deployment via the configured deployment capability
  ...
```

User types `dep`, selects `deploy` — it has a required `<branch>` positional,
so the next prompt fires immediately:

```
? Branch to deploy: › main
→ Triggering deployment for branch main…
```

### Layer 2 — parent command with no subcommand

```
$ holocron auth
? auth — choose a subcommand:
────────────────────────────────────────────────
❯ set     Verify + store a bootstrap token for a provider
  unset   Remove a stored bootstrap token
  check   Re-verify a stored bootstrap token
  list    List every provider with a stored bootstrap token
```

Subcommand pickers use the non-searchable `select()` from `@inquirer/prompts`
(`auth`: 4, `skills`: 3, `upgrade`: 2 — search adds no value at this scale;
open question #3 from the draft, resolved).

User selects `set` — `auth set` has a required `<provider>` positional, which
is free text (there's no closed provider list — providers are open-ended
plugin packages), so it renders as `input()`:

```
? Provider name: › vercel
```

`auth unset` / `auth check`, by contrast, render `provider` as a `select()`
over `listStoredProviders()` — you can only unset or check what's already
stored. If nothing is stored, the command fails with a clear message instead
of a `select()` with zero choices.

### Layer 3 — leaf command with missing required positional

```
$ holocron deploy
? Branch to deploy: › main
→ Triggering deployment for branch main…
```

```
$ holocron auth set
? Provider name: › vercel
```

In each case the prompt is answered and the command continues exactly as if
the positional had been passed on the command line.

---

## Architecture decision — spawn vs. re-parse

### Context

After the user picks a command (Layers 1–2) and any missing positionals are
collected, the selected handler must run.

### Option A — `yargs.parse([command, ...args])`

Call back into Yargs' own parse pipeline with a synthesized argv. All
middleware (telemetry, token-arg parsing, `--org` resolution) re-runs
automatically.

Problem: the `$0` default command lives in that same pipeline. Without a
re-entrancy guard a second no-args parse triggers the picker again.

### Option B — `child_process.spawn` (chosen)

After collecting all inputs, spawn a new `holocron` process with the resolved
argv and `stdio: 'inherit'`, await its exit code, and set
`process.exitCode` from it — the caller (`cli.ts`'s `$0` handler) then returns
normally, so the parent's own telemetry flush / update-notifier tail still
runs (an earlier draft of this spec called `process.exit()` directly inside
the handler; that would have skipped the tail — fixed before implementation).

```ts
function spawnChild(args: string[]): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [process.argv[1]!, ...args], { stdio: "inherit" });
    child.on("exit", (code) => resolve(code ?? 0));
    child.on("error", () => resolve(1));
  });
}
```

### Why Option B

- No re-entrancy risk: the child process is a plain top-level invocation.
- Full telemetry starts fresh in the child, as it would for any direct
  invocation. The parent's own `command_completed` event still fires too,
  with command name `"unknown"` (the middleware ran before any command was
  picked) — left as-is rather than suppressed (open question #2 from the
  draft, resolved): it's a real, useful signal ("the menu got used"), and
  suppressing it would need threading extra state through the telemetry
  module for marginal benefit.
- Tokens come from keyring / env / config — nothing is lost across process
  boundaries for the standard use case.
- Global flags present in the parent's argv (`--token`, `--org`, `--cwd`,
  `--dry-run`) are forwarded explicitly to the child so overrides are
  preserved.
- Simpler to reason about: the picker terminates, the command runs
  independently.

---

## Non-TTY guard (open question #1 from the draft, resolved)

`@inquirer/prompts` and `@inquirer/search` don't hang on a closed/non-TTY
stdin — they throw `ExitPromptError` the moment stdin ends. But that's a
confusing message for a CI pipeline or script that simply forgot a required
arg. Every prompt path checks `process.stdin.isTTY` first and throws
`NonInteractiveError` instead — a small class this module exports, added to
`cli.ts`'s existing `USER_FACING_ERRORS` set (from #576's graceful-error
work), so it prints as one clean line, no stack trace, same as the old
`demandCommand` failure:

```
$ holocron deploy < /dev/null
`deploy` needs "branch" — pass it directly: holocron deploy <branch>
[exit 1]
```

---

## Command registry

`packages/cli/src/interactive-menu.ts` exports `COMMAND_REGISTRY` — the
single source of truth for the interactive layer. Each entry mirrors its
corresponding Yargs registration in `cli.ts`. It does not introspect Yargs at
runtime — entries are hand-maintained in parallel with the Yargs
registrations. `run <task>` is deliberately excluded — it's CI/scripting-
oriented, and an interactive prompt in front of it would work against that.

```ts
interface PositionalPrompt {
  key: string; // matches the yargs positional's camelCased argv key
  cliArg?: string; // the kebab-case token in the command string, when it differs from `key`
  message: string; // label shown to the user
  type: "input" | "select";
  choices?: string[] | (() => string[]); // required for "select" — a fixed list, or a thunk resolved at prompt time
  validate?: (value: string) => boolean | string; // e.g. numeric positionals
}

interface CommandEntry {
  name: string; // full command name, e.g. "auth set"
  description: string; // one-liner, matches the yargs registration
  positionals: PositionalPrompt[]; // required positionals only, in order
  group?: string; // parent command: "auth" | "skills" | "upgrade"
}
```

### Full registry (26 entries)

| name              | positionals                                                | group     |
| ----------------- | ---------------------------------------------------------- | --------- |
| `auth check`      | `provider` (select — stored providers)                     | `auth`    |
| `auth list`       | —                                                          | `auth`    |
| `auth set`        | `provider` (input — no fixed list)                         | `auth`    |
| `auth unset`      | `provider` (select — stored providers)                     | `auth`    |
| `bump-versions`   | `newVersion` (input, `cliArg: new-version`)                | —         |
| `cleanup-preview` | `pr` (input, numeric validate)                             | —         |
| `ci`              | —                                                          | —         |
| `clone`           | —                                                          | —         |
| `config show`     | —                                                          | —         |
| `deploy`          | `branch` (input)                                           | —         |
| `doctor`          | —                                                          | —         |
| `new`             | —                                                          | —         |
| `plugin create`   | `slug` (input), `vendor` (input)                           | —         |
| `publish`         | — (`--initial` is a flag, not a positional — out of scope) | —         |
| `secret set`      | `name` (input)                                             | —         |
| `secrets sync`    | `environmentId` (input)                                    | —         |
| `setup`           | —                                                          | —         |
| `skills install`  | —                                                          | `skills`  |
| `skills remove`   | —                                                          | `skills`  |
| `skills update`   | —                                                          | `skills`  |
| `sync`            | —                                                          | —         |
| `sync-github`     | —                                                          | —         |
| `sync-readme`     | —                                                          | —         |
| `upgrade deps`    | —                                                          | `upgrade` |
| `upgrade node`    | `to` (input, numeric validate)                             | `upgrade` |
| `version`         | —                                                          | —         |

`new` and `plugin create` are included in the top-level picker; `plugin
create`'s `slug` / `vendor` are prompted via the registry (closing the gap
the draft called out — its own `--capability` / `--vendor-env` / `--base-url`
prompts, which stay in `cli.ts`, are unaffected).

`upgrade deps` was missing from the draft's table — without it the `upgrade`
group's Layer 2 picker would only ever show `node`, silently hiding a real
subcommand. Caught during implementation, not a design change.

---

## Implementation (as-built)

### `packages/cli/src/interactive-menu.ts`

- **`COMMAND_REGISTRY`** — as above.
- **`pickCommand(entries, message?)`** — `@inquirer/search` autocomplete.
  Delegates its `source` callback to **`searchChoices(entries, term)`**, a
  plain exported function (filter + map to `{ name, value, description }`) —
  factored out so it's unit-testable directly instead of only through a
  mocked `search()` call (see Tests).
- **`promptForPositionals(entry, argv)`** — for each positional in
  `entry.positionals` not already present in `argv`, prompts via `input()` /
  `select()`. Throws `NonInteractiveError` on non-TTY stdin, or when a
  `select` positional's resolved choices are empty.
- **`buildChildArgv(entry, positionals, parentArgv)`** — `entry.name.split(" ")`
  - positionals + `forwardedFlags(parentArgv)`.
- **`forwardedFlags(argv)`** — `--token` (repeated), `--org`, `--cwd`,
  `--dry-run`.
- **`launchMenu(entries, parentArgv, pickMessage?, nonInteractiveMessage?)`**
  — the Layer 1/2 orchestrator: TTY guard → `pickCommand` →
  `promptForPositionals` → `buildChildArgv` → spawn → `process.exitCode`.
  One function shared by the top-level `$0` and all three group `$0`s,
  parameterized by the entry filter and the two messages (each group keeps
  its original `demandCommand`-style non-interactive message).
- **`getEntry(name)`** — registry lookup by name, throwing on a typo. Not in
  the original design; added so `cli.ts`'s Layer 3 call sites
  (`promptForPositionals(getEntry("deploy"), argv)`) don't need `!` scattered
  around a `.find()`.
- **`NonInteractiveError`** — see the non-TTY guard section above.

### `packages/cli/src/cli.ts` changes

#### Top-level default command (Layer 1)

`.demandCommand(1, "Run \`holocron --help\`…")`removed. A`$0`default
command added right before`.strict()`:

```ts
.command("$0", false, () => {}, async (argv) => {
  await launchMenu(COMMAND_REGISTRY.filter((e) => !e.group), argv);
})
```

#### Parent command builders (Layer 2)

For `skills`, `upgrade`, `auth`: the `.demandCommand(1, "...")` at the end of
each builder chain is replaced with a `$0` subcommand, same shape, filtered
to that group and passing the original message through as
`nonInteractiveMessage`:

```ts
.command("$0", false, () => {}, async (argv) => {
  await launchMenu(
    COMMAND_REGISTRY.filter((e) => e.group === "auth"),
    argv,
    "auth — choose a subcommand:",
    "Run `holocron auth --help` to see available auth subcommands."
  );
})
```

### Layer 3 — **inline in `cli.ts`, not separate command files**

The draft proposed per-command handler files (`commands/secret.ts`,
`commands/npm/bump-versions.ts`, `commands/upgrade/node.ts`,
`commands/auth/set.ts`, …) calling `promptForPositionals`. Those paths never
existed — `new` and `plugin create` already establish the real pattern in
this codebase: **all interactive prompting lives in `cli.ts`'s handler
bodies**, not in the `commands/*.ts` orchestration modules (which stay
plugin/business-logic-only and have their own unit tests with injected
`print`/`loader`). Layer 3 follows that pattern instead of introducing a new
one:

```ts
async (argv) => {
  const [branch] = await promptForPositionals(getEntry("deploy"), argv as Record<string, unknown>);
  // ...
  branch: branch!,
}
```

The command string's required positional syntax changes from `<x>` to `[x]`
(yargs only enforces "required" from the bracket syntax in the command
string — `demandOption: true` on `.positional()` is redundant once the
bracket is `[x]` and was removed alongside it) so yargs stops hard-failing
before the handler ever runs.

Commands touched (10): `secret set`, `secrets sync`, `deploy`,
`cleanup-preview`, `bump-versions`, `plugin create`, `upgrade node`,
`auth set`, `auth unset`, `auth check`.

`cleanup-preview`'s `<pr>` is `type: "number"` in yargs but
`promptForPositionals` always returns strings (an `input()`/`select()`
result) — handlers that need a number call `Number(...)` on the resolved
value (`cleanup-preview`, `upgrade node`).

### New dependency

`@inquirer/search` — added to the default `catalog:` in
`pnpm-workspace.yaml` (alongside `@inquirer/prompts`) and to
`packages/cli/package.json`'s `dependencies`.

---

## Tests

- **`interactive-menu.test.ts`** (34 tests, 100%/97%/100%/100%
  stmts/branch/funcs/lines): `COMMAND_REGISTRY` invariants (no duplicate
  names, every `select` positional declares `choices`, groups limited to the
  three known parents, `run` excluded); `getEntry` found/not-found;
  `pickCommand` message/entry-resolution wiring (via `mockResolvedValue`, not
  `mockImplementation` — see the vitest note below); `searchChoices` filter
  behavior tested directly; `promptForPositionals` for every positional
  shape (input, select with static choices, select with a thunk, validate
  passthrough, already-present-in-argv skip, non-TTY throw, empty-choices
  throw); `forwardedFlags` for all four flag kinds; `buildChildArgv` for
  single- and multi-token commands; `launchMenu` end-to-end (pick → prompt →
  spawn → exit code, including a null exit code and a spawn error).
- **Vitest note (undocumented tooling quirk, not a design issue):**
  `searchMock.mockImplementation(async (cfg) => { await cfg.source(...); ... })`
  — an async mock implementation that itself awaits a callback captured from
  its argument — triggers a second, spurious invocation of the mock with
  `undefined` after the test body finishes, specifically when the describe
  block also has a `beforeEach` calling `.mockReset()`. Reproduced in
  isolation against `vitest@4.1.11` / `@vitest/spy@4.1.11`; root cause not
  pinned down (stack trace lands in `@vitest/runner`'s `callCleanupHooks` /
  `runWithTimeout`, i.e. hook-timeout machinery, not application code).
  Worked around by only ever using `mockResolvedValue` on `searchMock` and
  testing the `source` callback's filtering logic through the extracted
  `searchChoices` pure function instead of through the mock — better test
  design regardless, since it decouples "does `pickCommand` wire `search()`
  correctly" from "does the filter logic work", but noted here in case the
  same shape bites another test file.
- **Manual** (spot-checked non-TTY paths only, in this environment — no real
  TTY available to drive the interactive prompts end-to-end): `holocron`
  (Layer 1), `holocron auth` / `upgrade` / `skills` (Layer 2), and all 10
  Layer 3 leaf commands each print the expected `NonInteractiveError`
  message and exit 1 without hanging; supplying the positional directly
  (`holocron secret set MY_SECRET`) skips the prompt and reaches the normal
  handler logic unchanged.

---

## Resolved open questions (were open in the draft)

1. **Non-TTY / CI guard.** Needed — `@inquirer/prompts` throws
   `ExitPromptError` on a closed stdin rather than hanging, but that's a
   confusing message for a script. `process.stdin.isTTY` guard +
   `NonInteractiveError` restores the old `demandCommand`-style message.
2. **Telemetry for menu-sourced commands.** Not suppressed — the parent's
   `command_completed` event (name `"unknown"`) is left as a real signal
   alongside the child's own proper event.
3. **`select()` vs `search()` for Layer 2 pickers.** `select()` — confirmed
   `auth`: 4, `skills`: 3, `upgrade`: 2, all comfortably within `select()`'s
   sweet spot. Swap to `search()` at that group if it ever grows, no
   registry shape change needed.
