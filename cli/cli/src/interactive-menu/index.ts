/**
 * The interactive fallback — replaces every "run --help to see commands"
 * dead end with a prompt. Three layers, all driven by {@link COMMAND_REGISTRY}:
 *
 *   1. `holocron` with no command      → searchable picker over every command
 *   2. a parent command with no sub    → `select()` over that group's commands
 *   3. a leaf command missing a        → `input()` / `select()` per positional
 *      required positional
 *
 * Layers 1–2 are driven from `cli.ts`'s `$0` handlers via {@link launchMenu}:
 * pick a command, prompt for its required positionals, then **spawn a fresh
 * `holocron <command> …` child process** (`stdio: "inherit"`) rather than
 * re-entering yargs' own parse pipeline — see the spec's "spawn vs re-parse"
 * section (theholocron/holocron#438) for why. Layer 3 is driven directly from
 * each leaf command's own handler in `cli.ts`, calling
 * {@link promptForPositionals} for just that one command — no spawn needed,
 * the handler already has everything else it needs.
 *
 * For a command whose handler honours `--dry-run` ({@link
 * CommandEntry.supportsDryRun}), `launchMenu` always previews it first — a
 * dry run doesn't mutate anything, so there's nothing to ask permission
 * for — then, once that preview comes back clean and found something to
 * do, asks the one real decision: "proceed with the real run?". A preview
 * that finds nothing to do skips that question too. `--skip-dry-run` opts
 * a top-level invocation out of the preview entirely, straight to the
 * real run, for when you already know what you want.
 *
 * Every prompt is preceded by a `process.stdin.isTTY` check. A non-TTY run
 * (CI, a script, a pipe) throws {@link NonInteractiveError} instead of
 * hanging on `@inquirer/prompts` (which otherwise throws its own
 * `ExitPromptError` the moment stdin closes) — `cli.ts`'s `USER_FACING_ERRORS`
 * catch prints its message cleanly, restoring the old demandCommand-style
 * hard failure for non-interactive callers.
 */

export * from "./child-argv/index.js";
export * from "./command-registry/index.js";
export * from "./launch-menu/index.js";
export * from "./menu-items/index.js";
export * from "./probe-menu-entries/index.js";
export * from "./run-menu-entries/index.js";
