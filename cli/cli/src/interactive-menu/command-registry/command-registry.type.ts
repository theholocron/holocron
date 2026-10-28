import type { OptionMode, OptionPrompt, PositionalPrompt } from "../../ui/index.js";

export interface CommandEntry {
	/** Full command name as typed at the CLI, e.g. `"auth set"`. */
	name: string;
	/** One-liner, matches the yargs registration's description. */
	description: string;
	/** Required positionals only, in order. Empty when the command needs none. */
	positionals: PositionalPrompt[];
	/**
	 * This command's yargs options, offered through the menu
	 * (`promptForOptions`) — in declaration order, which also governs
	 * `when` evaluation order (holocron#1052). Global flags
	 * (`--token`/`--org`/`--cwd`/`--dry-run`) are never listed here; those
	 * are inherited from the parent invocation via `forwardedFlags`
	 * regardless of this command. Ignored when `modes` is set.
	 */
	options?: OptionPrompt[];
	/**
	 * Mutually exclusive workflows (holocron#1052 follow-up) — a mode is
	 * picked first ("What would you like to do?"), and only that mode's
	 * own options are then offered, so nothing contingent on a different
	 * mode is ever shown. Use this only when `options` would otherwise
	 * need `when` to express a real either/or relationship between them
	 * (`package publish`'s steady-state / `--initial` / `--sync-trust`);
	 * plain `options` stays the simpler default for everything else.
	 */
	modes?: OptionMode[];
	/**
	 * This command's yargs options deliberately NOT offered through the
	 * menu, with the reason recorded in review rather than in code — kept
	 * so a future drift test can tell "considered and skipped" apart from
	 * "never considered."
	 */
	skipOptions?: string[];
	/**
	 * Whether this command's handler honours the global `--dry-run` flag.
	 * Drives `launchMenu`'s dry-run offer: a menu-launched command with this
	 * set gets asked "run a dry run first?" (skipped if `--dry-run` was
	 * already passed at the top level) and, after a successful dry run,
	 * "proceed with the real run?". Hand-maintained in parallel with each
	 * handler's own `dryRun: argv.dryRun` usage in `cli.ts`.
	 */
	supportsDryRun?: boolean;
	/** The command opens a menu of its own (`probe`): shown with the same " ›" as a group, though nothing is nested under it. */
	opensMenu?: boolean;
	/**
	 * Override for {@link buildChildArgv}: the real CLI argv tokens to spawn,
	 * when they don't match a naive space-split of `name`. Every static
	 * entry's `name` already *is* its own argv (`"repo upgrade node"` →
	 * `["repo", "upgrade", "node"]`, three real yargs tokens) — this exists
	 * for {@link buildRunMenuEntries}'s dynamically-built task entries, whose
	 * `name` uses a space per namespace segment purely to get free nesting
	 * out of {@link menuItems} (`"run sourceQuality staticAnalysis"`), but
	 * whose real invocation is one dotted positional
	 * (`["run", "sourceQuality.staticAnalysis"]`), not three separate ones.
	 */
	spawnArgs?: string[];
}
