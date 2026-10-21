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
	 * it had never been selected. Not applied to `required` options. For a
	 * command whose options have real either/or relationships, prefer
	 * {@link OptionMode} instead — nothing contingent is ever shown in the
	 * first place, rather than silently dropped after being picked.
	 */
	when?: (answers: Readonly<Record<string, OptionAnswer>>) => boolean;
}

/**
 * One of a command's mutually exclusive workflows (holocron#1052 follow-up)
 * — `package publish`'s steady-state publish, `--initial` bootstrap, and
 * `--sync-trust` maintenance mode are three different things to do, not
 * three independent flags. The mode picked first decides which options are
 * even offered, so nothing contingent on another mode is ever shown.
 */
export interface OptionMode {
	/** Unique within the command's `modes` — identifies the pick, never shown. */
	key: string;
	/** Shown as this mode's choice label in the "what would you like to do?" prompt — keep it short; put caveats in `description` instead. */
	message: string;
	/**
	 * Longer explanation shown as helper text under this choice only while
	 * it's highlighted (`select()`'s own per-choice `description`) — the
	 * place for a caveat ("use only for a package's very first publish")
	 * that would make `message` too long to scan at a glance.
	 */
	description?: string;
	/**
	 * Emitted unconditionally once this mode is picked, before any of its
	 * own options — e.g. `"--initial"` for a bootstrap-publish mode. Omit
	 * for a mode that implies no flag of its own (steady-state here: no
	 * flag means "neither of the others").
	 */
	flag?: string;
	/** This mode's own options, prompted exactly like a flat command's `options` — required ones always asked, the rest behind one checkbox. */
	options?: OptionPrompt[];
}

/**
 * `promptForOptions`' result: every {@link OptionPrompt} relevant to
 * rendering, in order, paired with the answers collected for them.
 * `options` is the flat `OptionsCommand.options` list directly for a
 * flat command, or the picked mode's own `options` (plus a synthetic
 * entry for its `flag`, when it has one) for a `modes`-based command —
 * `buildChildArgv`/`secretEnv` render either shape identically, with no
 * need to know which kind of command produced it.
 */
export interface ResolvedOptions {
	options: OptionPrompt[];
	answers: Record<string, OptionAnswer>;
}

/** The part of a command that {@link promptForOptions} needs: its name and the options (or modes) to offer. */
export interface OptionsCommand {
	/** Full command name as typed at the CLI, e.g. `"package publish"`. */
	name: string;
	/** Declared options, in order. Undefined/empty means nothing to offer — no prompt at all. Ignored when `modes` is set. */
	options?: OptionPrompt[];
	/**
	 * Mutually exclusive workflows — when set, a mode is picked first and
	 * `options` above is ignored entirely; only the picked mode's own
	 * options are then offered. Use this only for a command whose options
	 * have a real either/or relationship; plain `options` covers
	 * everything else and stays the simpler default.
	 */
	modes?: OptionMode[];
}
