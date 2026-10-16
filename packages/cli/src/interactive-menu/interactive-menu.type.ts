import type { PositionalPrompt } from "../ui/index.js";

export interface CommandEntry {
	/** Full command name as typed at the CLI, e.g. `"auth set"`. */
	name: string;
	/** One-liner, matches the yargs registration's description. */
	description: string;
	/** Required positionals only, in order. Empty when the command needs none. */
	positionals: PositionalPrompt[];
	/**
	 * Whether this command's handler honours the global `--dry-run` flag.
	 * Drives `launchMenu`'s dry-run offer: a menu-launched command with this
	 * set gets asked "run a dry run first?" (skipped if `--dry-run` was
	 * already passed at the top level) and, after a successful dry run,
	 * "proceed with the real run?". Hand-maintained in parallel with each
	 * handler's own `dryRun: argv.dryRun` usage in `cli.ts`.
	 */
	supportsDryRun?: boolean;
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
