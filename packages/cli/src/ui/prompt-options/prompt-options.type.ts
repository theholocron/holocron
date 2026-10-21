/** A resolved option answer — the shapes `buildChildArgv`/`secretEnv` turn into argv tokens or env entries. */
export type OptionAnswer = string | boolean | string[];

export interface OptionPrompt {
	/** The yargs option's camelCased argv key, e.g. `"otp"`. */
	key: string;
	/** The literal flag as typed at the CLI, e.g. `"--otp"`. */
	flag: string;
	type: "confirm" | "input" | "select" | "password";
	message: string;
	/**
	 * Required when `type === "select"`. A plain list for a fixed set, or a
	 * thunk for a set resolved at prompt time — same shape as
	 * `PositionalPrompt.choices`.
	 */
	choices?: string[] | (() => string[]);
	default?: string | boolean;
	/**
	 * Collected with a masked `password()` prompt and delivered to the
	 * child through an environment variable instead of argv (`ps` and
	 * shell history expose argv) — never written to the dry-run preview
	 * echo, telemetry, or logs. Always paired with `type: "password"`.
	 */
	secret?: boolean;
	/** Always prompted, like a required positional — never behind the multi-select, and never subject to `when`. */
	required?: boolean;
	/** Boolean whose yargs default is `true` — answering "no" emits `--no-<flag>` instead of omitting the flag. */
	negatable?: boolean;
	/** Array option taking exactly `arity` values (e.g. `--sync-trust <old> <new>`) — prompted once per value. */
	arity?: number;
	/**
	 * Evaluated against answers collected so far, in declaration order —
	 * `false` skips prompting (and so emitting) this option entirely, as if
	 * it had never been selected. Not applied to `required` options.
	 */
	when?: (answers: Readonly<Record<string, OptionAnswer>>) => boolean;
}

/** The part of a command that {@link promptForOptions} needs: its name and the options to offer. */
export interface OptionsCommand {
	/** Full command name as typed at the CLI, e.g. `"package publish"`. */
	name: string;
	/** Declared options, in order. Undefined/empty means nothing to offer — no prompt at all. */
	options?: OptionPrompt[];
}
