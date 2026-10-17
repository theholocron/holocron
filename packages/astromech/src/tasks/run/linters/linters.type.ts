export interface LinterDef {
	/**
	 * super-linter `VALIDATE_*` keys this linter turns on. Setting any
	 * `VALIDATE_*` puts super-linter in allow-list mode, so emitting only the
	 * enabled keys makes it run exactly this set.
	 */
	validate: string[];
	/** super-linter `FIX_*` keys (auto-commit / `--write` parity). */
	fix?: string[];
	/**
	 * Local binary, resolved from `node_modules/.bin` then `PATH`. Absent →
	 * the linter has no meaningful local run (`holocron run lint` prints
	 * "CI only"); CI still enforces it.
	 */
	localBin?: string;
	/** Args for `localBin` in CHECK mode — never `--write` / `--fix`. */
	localArgs?: string[];
	/**
	 * Shown by `holocron run lint` when `localBin` is set but not found on
	 * PATH — the "you're missing a tool the repo needs" nudge.
	 */
	installHint?: string;
	/**
	 * Repo-root filenames that auto-enable this linter when the `lint` task
	 * has no explicit `linters` list. Ignored when {@link always} is set.
	 */
	detect?: string[];
	/** Enabled regardless of detection (the org baseline). */
	always?: boolean;
	/** Reusable-workflow config-file input this linter honors, if any. */
	configInput?: "eslint-config" | "prettier-config" | "yaml-config";
}
