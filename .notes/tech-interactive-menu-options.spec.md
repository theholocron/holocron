---
status: draft
issue: theholocron/holocron#1052
blocked-by: []
related:
  - theholocron/holocron#438
---

# Interactive menu: prompt for command options

## Problem

`holocron` with no arguments opens a menu (`tool-interactive-cli-menu`, #438).
After a command is picked, the menu prompts only for its **required
positionals** (`CommandEntry.positionals`) and forwards four global flags
(`--token`, `--org`, `--cwd`, `--dry-run`, see `forwardedFlags`).

Command-specific options are never offered. Reaching `package publish` through
the menu always runs the steady-state publish; `--initial` and `--otp` need the
full command typed by hand. The same gap exists for every command with
options (about 68 `.option(` declarations in `cli.ts`).

## Goals

1. Any option of any menu-reachable command can be set from the menu.
2. One source of truth: adding a yargs option must not silently leave the menu
   behind.
3. The menu stays quick: the common case (no options) adds at most one
   question.
4. Secrets never appear in the child's argv, logs or telemetry.

## Design

### 1. Declare options on `CommandEntry`

```ts
interface OptionPrompt {
  key: string; // yargs key, e.g. "otp"
  flag: string; // "--otp"
  type: "confirm" | "input" | "select" | "password";
  message: string;
  choices?: string[]; // select
  default?: string | boolean;
  secret?: boolean; // password prompt, delivered via env (see 3)
  when?: (answers: Record<string, unknown>) => boolean; // e.g. otp only if initial
}
interface CommandEntry {
  // ...existing
  options?: OptionPrompt[];
  /** Options deliberately not offered in the menu (with a reason in review). */
  skipOptions?: string[];
}
```

### 2. Ask once, not per option

After positionals, if the command has `options`, show one multi-select:
"Set any options? (space to select, enter to skip)". Only the chosen options
are prompted, in declaration order, honouring `when`. Pressing enter with
nothing selected adds no friction. Previewing with `--dry-run` runs with the
chosen flags, and the real run reuses the same answers.

### 3. Secrets

`secret: true` options are collected with a masked prompt and passed to the
child through an environment variable instead of argv (`ps` and shell history
expose argv). Each secret option's handler reads
`firstEnv(env, ["HOLOCRON_OTP", ...])` via `holocronEnv` (the `HOLOCRON_`
prefix helper), falling back to the flag. The value is never written to the
dry-run preview echo, to `command_completed` telemetry, or to logs.

### 4. Drift guard

`contexts.test.ts` already fails when a command lacks a context entry. Add the
same kind of test: build the yargs instance, and for every command in
`COMMAND_REGISTRY` assert that each of its options (minus globals) appears in
`options` or `skipOptions`. A new `.option()` then fails CI until the menu
decision is made.

### 5. Argv construction

`buildChildArgv(entry, positionals, optionAnswers, parentArgv, dryRun)`:
booleans become `--flag` when true, strings `--flag value`, repeatable options
repeat, secrets are omitted from argv and set in the child's env by
`spawnChild`'s `extraEnv`.

## Rollout

1. Types, the multi-select flow, `buildChildArgv`, secret env delivery, the
   drift test, with `package publish` (`--initial`, `--otp`, `--tag`) as the
   first entry.
2. One PR per command group (`repo`, `package`, `new`, `secrets`, `run`, …)
   filling in `options` / `skipOptions`, so each is reviewable and the drift
   test stays red-to-green per group.
3. Update `AGENTS.md` (interactive-fallback bullet) and
   `packages/cli/README.md`.

## Open questions

- Should `when` support dependencies between options generally, or is
  `--otp` after `--initial` the only case? Start with a plain predicate.
- Required-ness: yargs `demandOption` options behave like positionals (always
  prompted). Does any command use that today?
- Persisting last-used answers per command (opt-in) — out of scope here.

## Verification

- Menu-launched `package publish` can run `--initial --otp` with the OTP not
  visible in `ps` output, the dry-run echo or telemetry.
- Drift test fails when an option is added to a registered command without a
  menu decision.
- All existing `launch-menu` tests pass; new tests cover the multi-select,
  `when`, secrets and argv building.
