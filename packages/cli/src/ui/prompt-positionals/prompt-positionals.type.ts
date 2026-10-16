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

/** The part of a command that {@link promptForPositionals} needs: its name and the positionals to ask for. */
export interface PositionalCommand {
	/** Full command name as typed at the CLI, e.g. `"auth set"`. */
	name: string;
	/** Required positionals only, in order. */
	positionals: PositionalPrompt[];
}
