export interface PositionalPrompt {
	/** The yargs positional's camelCased argv key (e.g. `"newVersion"`). */
	key: string;
	/**
	 * The literal token in the command string, when it differs from `key`
	 * (yargs positionals are kebab-case there — `<new-version>` — but
	 * camelCased in argv). Shown in the non-interactive fallback message.
	 * Defaults to `key`.
	 */
	cliArg?: string;
	/** Label shown to the user. */
	message: string;
	type: "input" | "select";
	/**
	 * Required when `type === "select"`. A plain list for a fixed set, or a
	 * thunk for a set resolved at prompt time (e.g. `auth unset`'s provider
	 * choices are whatever currently has a stored token — there's no fixed
	 * provider list, providers are open-ended plugin packages).
	 */
	choices?: string[] | (() => string[]);
	/** Optional `input()` validation — e.g. numeric positionals. */
	validate?: (value: string) => boolean | string;
}

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

/** A row in one level of the nested menu: a command to run, a group to open, or "back". */
export interface MenuItem {
	name: string;
	/** A command name, `group:<path>` to open a submenu, or {@link BACK}. */
	value: string;
	description: string;
	/** Lower-cased text the search box matches against (a group includes everything under it). */
	haystack: string;
}
