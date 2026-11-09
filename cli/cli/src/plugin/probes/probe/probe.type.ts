/** One line a probe reports: `info` for a fact, `ok` / `fail` for a result, `heading` to title the rows that follow. */
export interface ProbeRow {
	/** `ok` or `fail` for a result, `info` for a fact, `heading` to title the rows that follow. */
	status: "ok" | "fail" | "info" | "heading";
	/** The row's short title. */
	label: string;
	/** Further detail, when there is some. */
	detail?: string;
}

/** What a probe is handed. Everything it prints or changes goes through this, so the runner can enforce the rules. */
export interface ProbeContext {
	/** What the person typed after the probe name (`probe deps who vitest` hands `["vitest"]`). */
	args?: readonly string[];
	/**
	 * `--lcov <path>`: where a probe that measures coverage also writes an lcov report, on top of the rows it prints.
	 * Relative to the repo root. Unset when the flag was not given.
	 */
	lcov?: string;
	/** `--dry-run`: `write` calls are announced and skipped. */
	dryRun: boolean;
	/** Report one line. The text is scrubbed of secrets before it is printed. */
	say(row: ProbeRow): void;
	/**
	 * Change something on the provider. The only way to: on `--dry-run` it prints `would <label>` and does not call `fn`,
	 * and a probe that did not declare `writes: true` cannot call it.
	 */
	write<T>(label: string, fn: () => Promise<T>): Promise<T | undefined>;
	/** Register how to undo something this probe made. Runs in reverse order on success, failure and Ctrl-C. */
	cleanup(label: string, fn: () => Promise<void>): void;
	/** Mark a value (a token, a signing secret) as one that must never be printed. */
	secret(value: string | undefined): void;
}

/** A named, on-demand poke at a live provider. */
export interface Probe {
	/** One sentence for `holocron probe`'s listing. */
	summary: string;
	/** Whether it creates or changes anything on the provider. Asked about first, and needs `--yes` without a terminal. */
	writes: boolean;
	/** Runs the probe, reporting and changing things only through `ctx`. */
	run(ctx: ProbeContext): Promise<void>;
}

/** A plugin's probes by name (kebab-case), as returned from `createPlugin` next to `capabilities`. */
export type PluginProbes = Record<string, Probe>;
