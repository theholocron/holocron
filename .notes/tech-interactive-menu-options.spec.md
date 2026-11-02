---
id: SPEC-0046
status: proposed
issue: theholocron/holocron#1052
blocked-by: []
related:
  - theholocron/holocron#438
discussion:
  url: https://discord.com/channels/1303969001822486568/1566618564859920424
---

# Interactive menu: prompt for command options

## Status

Rollout step 1 (types, the multi-select flow, `buildChildArgv`, secret env
delivery, `package publish` as the first `options`-declaring entry) is done.
Steps 2 (one PR per remaining command group) and 3 (this file's own eventual
move to `docs/wiki/specifications/`) are still open — `AGENTS.md`'s
Interactive fallback bullet and `packages/cli/README.md`'s Interactive mode
section already reflect what's shipped so far.

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
  required?: boolean; // demandOption or handler-enforced: always prompted
  negatable?: boolean; // boolean whose yargs default is true: emit --no-<flag>
  arity?: number; // array options that take N values (e.g. --sync-trust <old> <new>)
  when?: (answers: Record<string, unknown>) => boolean; // e.g. provenance only if !initial
}
interface CommandEntry {
  // ...existing
  options?: OptionPrompt[];
  /** Positionals may also carry `when`, so a conflicting option can suppress them. */
  /** Options deliberately not offered in the menu (with a reason in review). */
  skipOptions?: string[];
}
```

### 2. Ask once, not per option

Order of questions for a menu-launched command:

1. **Required options** (`required: true`, e.g. `deploy cleanup-preview
--project`) are always prompted, like required positionals. They are never
   behind the multi-select, otherwise yargs rejects the child before its
   handler runs.
2. **One multi-select** over the optional options: "Set any options? (space to
   select, enter to skip)". Only the chosen ones are prompted, in declaration
   order, honouring `when`. Pressing enter with nothing selected adds no
   friction.
3. **Positionals** that conflict with a chosen option are skipped. `deploy`
   registers `branch` as a required positional while `--files` conflicts with
   it, so `branch` carries `when: (a) => !a.files` and the options step has to
   run before positionals for commands that declare a conflict. Otherwise
   `--files` could never be launched from the menu.

Previewing with `--dry-run` runs with the chosen flags, and the real run
reuses the same answers.

`when` is a general predicate over earlier answers. Cases found in `cli.ts`:

- `package publish`: `--otp` applies to **both** the bootstrap and
  steady-state publish (the handler forwards it in both paths), so it is not
  conditioned on `--initial`. `--provenance` and `--skip-already-published`
  are steady-state only (`when: !initial`). `--sync-trust` is a separate mode
  that makes the rest irrelevant.
- `deploy`: `--files` conflicts with `branch`.

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
`COMMAND_REGISTRY` **and** for the generated `run` entries, assert that each
of its options (minus globals) appears in `options` or `skipOptions`. Options
enforced only in the handler (such as `deploy --project-id`) cannot be seen
by this test, so they are listed as `required: true` by hand. A new `.option()` then fails CI until the menu
decision is made.

### 5. Argv construction

`buildChildArgv(entry, positionals, optionAnswers, parentArgv, dryRun)`:

- booleans: `--flag` when true; when false, omitted if the yargs default is
  false, but `--no-flag` if the default is true (`negatable: true`, e.g.
  `package publish --provenance`), otherwise answering "no" would silently
  keep the default;
- strings `--flag value`, repeatable options repeat;
- multi-value options (`arity: 2`, `--sync-trust <old> <new>`) prompt once
  per value and are serialized as `--flag a b`; the handler's own
  "exactly two values" check remains the backstop;
- secrets are omitted from argv and set in the child's env by `spawnChild`'s
  `extraEnv`.

### 6. Dynamically generated `run` entries

`run <task>` entries are built at runtime by `buildRunMenuEntries` from the
task list, so they have no static registry row. They all share the same yargs
command (`run`) and therefore the same options: `--required`, `--all`
(`run ci` only, so `when` on the task) and `--filter`. Define one
`RUN_OPTIONS` constant and attach it to every generated entry, and run the
drift test against the `run` command's yargs options as well as the static
registry.

## Rollout

1. Types, the multi-select flow, `buildChildArgv`, secret env delivery, the
   drift test, with `package publish` (`--initial`, `--otp`, `--tag`) as the
   first entry.
2. One PR per command group (`repo`, `package`, `new`, `secrets`, `run`, …)
   filling in `options` / `skipOptions`, so each is reviewable and the drift
   test stays red-to-green per group.
3. Update `AGENTS.md` (interactive-fallback bullet) and
   `packages/cli/README.md`.

## Findings from surveying `cli.ts`

- **Required options exist.** `deploy cleanup-preview` declares `--project`
  with `demandOption: true`. `deploy` needs `--project-id` but enforces it in
  the handler, not in yargs (a comment explains that `demandOption` would be
  inherited by nested subcommands). Both behave like positionals: the menu
  must always prompt for them, so `OptionPrompt` needs `required?: boolean`
  and the drift test must treat handler-enforced options as required too.
- **Dependent options are not only `--otp` after `--initial`.** `deploy` has
  `.conflicts("files", "branch")` and the registry makes `branch` a required
  positional, so today `--files` is unreachable from the menu. `publish` has
  steady-state-only and mode-only options (see section 2). So `when` is a
  general predicate over earlier answers, applying to options and
  positionals. No `.implies()` or `.check()` calls exist today.
- **Array options with fixed arity.** `package publish --sync-trust` takes
  exactly two values.
- **Default-true booleans.** `package publish --provenance` defaults to true.
- Everything else is an independent optional flag, which the multi-select
  covers.

## Open questions

- Handler-enforced requirements are invisible to yargs. Either move them into
  yargs (`demandOption` on the leaf command only) or list them explicitly as
  `required: true` in the registry. Prefer the registry; changing yargs
  behaviour is out of scope.
- Persisting last-used answers per command (opt-in) is out of scope here.

## Verification

- Menu-launched `package publish` can run `--initial --otp` with the OTP not
  visible in `ps` output, the dry-run echo or telemetry.
- Drift test fails when an option is added to a registered command without a
  menu decision.
- All existing `launch-menu` tests pass; new tests cover the multi-select,
  `when`, secrets and argv building.
