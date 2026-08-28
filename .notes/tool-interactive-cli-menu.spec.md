---
status: draft
issue:
blocked-by: []
---

# Interactive CLI menu — no-args and missing-positional fallback

Replace every "run --help to see commands" dead end with an interactive
prompt. When `holocron` is invoked without a command, a required subcommand,
or a required positional argument, the CLI presents a searchable menu and
continues without exiting.

---

## Motivation

The CLI today fails loudly when a user forgets an argument:

```
$ holocron
Run `holocron --help` to see available commands.
[exit 1]
```

The user then runs `--help`, scans 21 commands, memorizes or copies the one
they want, and re-invokes. Three round-trips for what a single interactive
prompt handles in one.

This failure mode appears at three levels:

- **Top level** — `holocron` with no command
- **Parent commands** — `holocron skills`, `holocron auth`, etc. with no subcommand
- **Leaf commands** — `holocron deploy` or `holocron secret set` with the
  required positional missing

Each is a dead end today. The fix is the same pattern `new` and `plugin create`
already use: detect the gap, prompt for what is missing, continue.

---

## Goals

- Zero dead ends — no invocation of `holocron` exits with a "run --help" error.
  Every missing piece is filled interactively.
- Searchable command picker at the top level — users type to filter 21+ commands;
  arrow keys still work.
- Same picker pattern for parent-command subcommand selection (small lists use
  a plain scrollable select).
- Missing required positionals prompted inline, using the same `@inquirer/prompts`
  patterns already established in `new` and `plugin create`.
- No behavior change when all required args are supplied via CLI flags — the
  interactive path is purely a fallback.
- One new dependency: `@inquirer/search` for the searchable autocomplete.
  Everything else uses the existing `@inquirer/prompts` v8.

## Non-goals

- Fuzzy-matching for mistyped command names (e.g., `depoly → did you mean
deploy?`). Yargs `.strict()` already handles unknown commands with a clear
  error; that path is unchanged.
- Interactive fallback for optional positionals or options — only required
  positionals that would otherwise cause a hard failure.
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
  cleanup-preview  List and delete Cloudflare Pages preview deployments for a PR
  clone            Clone all repos in a GitHub org as siblings under a directory
  config show      Print the resolved holocron config
  deploy           Trigger a deployment via the configured deployment capability
  ...
```

User types `dep`:

```
? What would you like to do? › dep
────────────────────────────────────────────────
❯ deploy           Trigger a deployment via the configured deployment capability
```

User selects `deploy` — the command has a required `<branch>` positional, so
the next prompt fires immediately:

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
(≤4 items; search adds no value at that scale).

User selects `set` — `auth set` has a required `<provider>` positional, which
is a fixed-choice field, so it also renders as `select()`:

```
? Provider:
────────────────────────────────────────────────
❯ cloudflare
  github
  sentry
  ...
```

### Layer 3 — leaf command with missing required positional

```
$ holocron deploy
? Branch to deploy: › main
→ Triggering deployment for branch main…
```

```
$ holocron auth set
? Provider:
────────────────────────────────────────────────
❯ cloudflare
  github
  sentry
```

In each case the prompt is answered and the command continues exactly as if the
positional had been passed on the command line.

---

## Architecture decision — spawn vs. re-parse

### Context

After the user picks a command and any missing positionals are collected, the
selected handler must run. Two approaches were considered.

### Option A — `yargs.parse([command, ...args])`

Call back into Yargs' own parse pipeline with a synthesized argv. All
middleware (telemetry, token-arg parsing, `--org` resolution) re-runs
automatically.

Problem: the `$0` default command lives in that same pipeline. Without a
re-entrancy guard a second no-args parse triggers the picker again. A boolean
flag (`let launchedViaMenu`) can prevent this, but it is implicit shared state
that obscures control flow and would need to be threaded through the entire
middleware stack.

### Option B — `child_process.spawn` (chosen)

After collecting all inputs, spawn a new `holocron` process with the resolved
argv and `stdio: 'inherit'`:

```ts
spawn(process.execPath, [process.argv[1]!, command, ...collectedArgs], {
  stdio: "inherit",
});
```

The parent exits once the child exits. From the user's perspective the session
is seamless — one continuous terminal interaction followed by the command's
normal output.

### Why Option B

- No re-entrancy risk: the child process is a plain top-level invocation.
- Full telemetry starts fresh in the child, as it would for any direct invocation.
- Tokens come from keyring / env / config — nothing is lost across process
  boundaries for the standard use case.
- Global flags present in the parent's argv (`--token`, `--org`, `--cwd`,
  `--dry-run`) are forwarded explicitly to the child so overrides are preserved.
- Simpler to reason about: the picker terminates, the command runs independently.

---

## Command registry

A new module, `src/interactive-menu.ts`, exports `COMMAND_REGISTRY` — the
single source of truth for the interactive layer. Each entry mirrors its
corresponding Yargs registration.

```ts
interface PositionalPrompt {
  key: string; // matches the yargs positional name
  message: string; // label shown to the user
  type: "input" | "select";
  choices?: string[]; // required when type === "select"
}

interface CommandEntry {
  name: string; // full command name, e.g. "auth set"
  description: string; // one-liner, matches the yargs registration
  positionals: PositionalPrompt[]; // required positionals only, in order
  group?: string; // parent command: "auth" | "skills" | "npm" | "upgrade"
}
```

The registry is a plain `CommandEntry[]` defined inline in
`interactive-menu.ts`. It does not introspect Yargs at runtime — entries are
hand-maintained in parallel with the Yargs registrations in `cli.ts`. This is a
lightweight constraint: the registry only needs updating when a required
positional changes or a new command is added.

### Full registry

| name                  | positionals                      | group     |
| --------------------- | -------------------------------- | --------- |
| `auth check`          | `provider` (select)              | `auth`    |
| `auth list`           | —                                | `auth`    |
| `auth set`            | `provider` (select)              | `auth`    |
| `auth unset`          | `provider` (select)              | `auth`    |
| `cleanup-preview`     | `pr` (input)                     | —         |
| `clone`               | —                                | —         |
| `config show`         | —                                | —         |
| `deploy`              | `branch` (input)                 | —         |
| `doctor`              | —                                | —         |
| `new`                 | —                                | —         |
| `npm bump-versions`   | `new-version` (input)            | `npm`     |
| `npm publish-initial` | —                                | `npm`     |
| `plugin create`       | `slug` (input), `vendor` (input) | —         |
| `secret set`          | `name` (input)                   | —         |
| `secrets sync`        | `environmentId` (input)          | —         |
| `setup`               | —                                | —         |
| `skills install`      | —                                | `skills`  |
| `skills remove`       | —                                | `skills`  |
| `skills update`       | —                                | `skills`  |
| `sync`                | —                                | —         |
| `sync-github`         | —                                | —         |
| `sync-readme`         | —                                | —         |
| `upgrade node`        | `to` (input)                     | `upgrade` |
| `version`             | —                                | —         |

`new` and `plugin create` are included in the top-level picker but have no
registry positionals — both already prompt for everything they need internally.

---

## Implementation

### New dependency

`@inquirer/search` added to `packages/cli/package.json`. If `@inquirer/*`
packages are pinned via a catalog in `pnpm-workspace.yaml`, add the entry there
as well.

### New file: `packages/cli/src/interactive-menu.ts`

**`COMMAND_REGISTRY: CommandEntry[]`** — full registry as defined above.

**`pickCommand(entries: CommandEntry[]): Promise<CommandEntry>`** — renders an
`@inquirer/search` autocomplete over `entries`. Each choice displays `name` and
`description`. Returns the selected entry. Used by the Layer 1 top-level picker
and Layer 2 parent-command pickers (which may pass a filtered subset).

**`promptForPositionals(entry: CommandEntry, argv: Record<string, unknown>): Promise<string[]>`** — for each positional in `entry.positionals` where
`argv[positional.key]` is `undefined`, calls `input()` or `select()` from
`@inquirer/prompts`. Returns resolved values in positional order.

**`buildChildArgv(entry: CommandEntry, positionals: string[], parentArgv: Record<string, unknown>): string[]`** — splits `entry.name` into tokens (handles two-word commands
like `auth set`), appends resolved positional values, then appends forwarded
global flags from `parentArgv`.

**`forwardedFlags(argv: Record<string, unknown>): string[]`** — extracts
`--token`, `--org`, `--cwd`, and `--dry-run` from the parent's argv and
serializes them as a string array ready for spawn.

### `packages/cli/src/cli.ts` changes

#### Top-level default command (Layer 1)

Remove `.demandCommand(1, "Run \`holocron --help\` to see available commands.")`.

Add a `$0` default command before `.parse()`:

```ts
.command("$0", false, () => {}, async (argv) => {
  const entries = COMMAND_REGISTRY.filter((e) => !e.group);
  const picked = await pickCommand(entries);
  const positionals = await promptForPositionals(picked, argv as Record<string, unknown>);
  const childArgv = buildChildArgv(picked, positionals, argv as Record<string, unknown>);
  const child = spawn(process.execPath, [process.argv[1]!, ...childArgv], {
    stdio: "inherit",
  });
  child.on("exit", (code) => process.exit(code ?? 0));
})
```

#### Parent command builders (Layer 2)

For each of `skills`, `npm`, `upgrade`, `auth` — add a `$0` subcommand inside
the builder and remove the existing `.demandCommand(1)`:

```ts
.command("$0", false, () => {}, async (argv) => {
  const group = "auth"; // or "skills" | "npm" | "upgrade"
  const entries = COMMAND_REGISTRY.filter((e) => e.group === group);
  const picked = await pickCommand(entries);
  const positionals = await promptForPositionals(picked, argv as Record<string, unknown>);
  const childArgv = buildChildArgv(picked, positionals, argv as Record<string, unknown>);
  const child = spawn(process.execPath, [process.argv[1]!, ...childArgv], {
    stdio: "inherit",
  });
  child.on("exit", (code) => process.exit(code ?? 0));
})
```

### Per-command handler changes (Layer 3)

Each handler checks its required positionals at the top before any real work,
using `promptForPositionals` from `interactive-menu.ts`. The pattern is the
same in every case — look up the registry entry for the command, call
`promptForPositionals`, and use the resolved values.

Commands requiring changes:

| File                              | Positional(s)    |
| --------------------------------- | ---------------- |
| `commands/deploy.ts`              | `branch`         |
| `commands/secret.ts`              | `name`           |
| `commands/secrets-sync.ts`        | `environmentId`  |
| `commands/cleanup-preview.ts`     | `pr`             |
| `commands/npm/bump-versions.ts`   | `new-version`    |
| `commands/upgrade/node.ts`        | `to`             |
| `commands/auth/set.ts`            | `provider`       |
| `commands/auth/unset.ts`          | `provider`       |
| `commands/auth/check.ts`          | `provider`       |
| `commands/plugin-create/index.ts` | `slug`, `vendor` |

`plugin-create` already prompts for `--capability`, `--vendor-env`, and
`--base-url` when those flags are absent. The two positionals (`slug`, `vendor`)
are the only gap closed here.

`cleanup-preview` already uses `checkbox()` to select deployments to delete
after setup. The `<pr>` positional is the gap: when absent, prompt for it with
`input()` before the checkbox selection runs.

### File change summary

| File                                   | Change                                                                                                                 |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `packages/cli/package.json`            | add `@inquirer/search`                                                                                                 |
| `packages/cli/src/interactive-menu.ts` | **new** — registry, `pickCommand`, `promptForPositionals`, `buildChildArgv`, `forwardedFlags`                          |
| `packages/cli/src/cli.ts`              | `$0` top-level default; `$0` in 4 parent builders; remove `demandCommand(1)` at top level and from each parent builder |
| `commands/deploy.ts`                   | `promptForPositionals` at handler top                                                                                  |
| `commands/secret.ts`                   | `promptForPositionals` at handler top                                                                                  |
| `commands/secrets-sync.ts`             | `promptForPositionals` at handler top                                                                                  |
| `commands/cleanup-preview.ts`          | `promptForPositionals` at handler top                                                                                  |
| `commands/npm/bump-versions.ts`        | `promptForPositionals` at handler top                                                                                  |
| `commands/upgrade/node.ts`             | `promptForPositionals` at handler top                                                                                  |
| `commands/auth/set.ts`                 | `promptForPositionals` at handler top                                                                                  |
| `commands/auth/unset.ts`               | `promptForPositionals` at handler top                                                                                  |
| `commands/auth/check.ts`               | `promptForPositionals` at handler top                                                                                  |
| `commands/plugin-create/index.ts`      | `promptForPositionals` at handler top for `slug` + `vendor`                                                            |

---

## Test plan

- **Unit — `interactive-menu.ts`**: `buildChildArgv` for each command shape (no
  positionals, one input positional, two positionals, select positional);
  `forwardedFlags` with all four flag types; `promptForPositionals` with a
  pre-filled argv key (should skip the prompt for that key and return the
  existing value).
- **Unit — `cli.ts` `$0` handler**: stub `pickCommand`, `promptForPositionals`,
  and `spawn`; assert `spawn` is called with the expected argv for a command
  with no positionals and for a command with one positional.
- **Manual**: run `holocron` with no args, verify the search picker appears, a
  command can be selected, required positionals are prompted, and the command
  runs to completion. Repeat for `holocron auth` (Layer 2) and `holocron deploy`
  with no branch (Layer 3).

---

## Open questions

1. **Non-TTY / CI guard.** `@inquirer/prompts` throws when stdin is not a TTY.
   This may give CI pipelines the old hard-failure behavior for free — but it
   needs verification during implementation. If not, a `process.stdin.isTTY`
   guard should fall through to the original `demandCommand` error.
2. **Telemetry for menu-sourced commands.** The child records a normal telemetry
   event. The parent fires `startCommand` with command name "unknown" (no
   positional was captured before the picker ran). Whether to suppress the
   parent event or log it as a distinct `menu-pick` event is TBD.
3. **`select()` vs `search()` for Layer 2 pickers.** All parent groups have ≤4
   subcommands today; `select()` is the right call. If any group grows, swap to
   `search()` at that point with no registry changes needed.
