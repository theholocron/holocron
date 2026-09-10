/**
 * The linter registry — one list of linter names (from `config.tasks`'
 * `{ name: "lint", linters: [...] }`, or auto-detected) maps to both the
 * CI super-linter `VALIDATE_*` env and the native local run. This table is
 * the single source of truth for that mapping; {@link superLinterConfig}
 * (CI) and the `holocron run lint` aggregate (local) both read it.
 *
 * Spec: `docs/wiki/specifications/tech-astromech-task-runner.spec.md` "Lint parity".
 */

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

/**
 * Known linters, in execution order. `always` entries are the current
 * hard-coded super-linter baseline; `prettier` is always-on because the org
 * applies it universally (super-linter only lints files that exist).
 */
export const LINTERS: Record<string, LinterDef> = {
	eslint: {
		validate: ["VALIDATE_JAVASCRIPT_ES", "VALIDATE_TYPESCRIPT_ES"],
		localBin: "eslint",
		localArgs: ["."],
		detect: [
			"eslint.config.ts",
			"eslint.config.js",
			"eslint.config.mjs",
			"eslint.config.cjs",
			".eslintrc",
			".eslintrc.json",
			".eslintrc.yml",
			".eslintrc.yaml",
			".eslintrc.cjs",
		],
		configInput: "eslint-config",
	},
	prettier: {
		validate: [
			"VALIDATE_JAVASCRIPT_PRETTIER",
			"VALIDATE_JSX_PRETTIER",
			"VALIDATE_TYPESCRIPT_PRETTIER",
			"VALIDATE_TSX",
			"VALIDATE_MARKDOWN_PRETTIER",
		],
		fix: [
			"FIX_JAVASCRIPT_PRETTIER",
			"FIX_JSX_PRETTIER",
			"FIX_TYPESCRIPT_PRETTIER",
			"FIX_TSX",
			"FIX_MARKDOWN_PRETTIER",
		],
		always: true,
		localBin: "prettier",
		localArgs: ["--check", "."],
		configInput: "prettier-config",
	},
	yamllint: {
		validate: ["VALIDATE_YAML"],
		always: true,
		localBin: "yamllint",
		localArgs: ["."],
		installHint: "brew install yamllint",
		configInput: "yaml-config",
	},
	actionlint: {
		validate: ["VALIDATE_GITHUB_ACTIONS"],
		always: true,
		localBin: "actionlint",
		localArgs: [],
		installHint: "brew install actionlint",
	},
	gitleaks: {
		validate: ["VALIDATE_GITLEAKS"],
		always: true,
		localBin: "gitleaks",
		localArgs: ["dir", "--no-banner"],
		installHint: "brew install gitleaks",
	},
	editorconfig: {
		validate: ["VALIDATE_EDITORCONFIG"],
		always: true,
		localBin: "editorconfig-checker",
		localArgs: [],
		installHint: "brew install editorconfig-checker",
	},
	commitlint: {
		// A commit-message check, not a file linter — enforced at commit time
		// (the `commit-msg` hook) and in CI (super-linter, PR range). No local
		// slot in `holocron run lint`.
		validate: ["VALIDATE_GIT_COMMITLINT"],
		always: true,
	},
	"git-merge-conflict-markers": {
		validate: ["VALIDATE_GIT_MERGE_CONFLICT_MARKERS"],
		always: true,
	},
	markdownlint: {
		validate: ["VALIDATE_MARKDOWN"],
		localBin: "markdownlint-cli2",
		localArgs: ["**/*.md"],
		detect: [
			".markdownlint.json",
			".markdownlint.jsonc",
			".markdownlint.yaml",
			".markdownlint.yml",
			".markdownlint-cli2.jsonc",
			".markdownlint-cli2.yaml",
			".markdownlint-cli2.mjs",
		],
	},
};

/** Every linter name the registry knows. */
export const LINTER_NAMES: ReadonlySet<string> = new Set(Object.keys(LINTERS));

/**
 * Resolve the linter set for a repo. An `explicit` list (from
 * `config.tasks`) wins verbatim; otherwise every `always` linter plus every
 * linter whose `detect` filenames are present at the repo root. Result is
 * ordered by {@link LINTERS} declaration order.
 *
 * @throws when an `explicit` name is not in the registry — a typo is a
 * config bug, not a linter to silently skip.
 */
export function resolveLinters(opts: {
	explicit?: string[];
	rootFiles: string[];
}): Array<{ name: string; def: LinterDef }> {
	const order = Object.keys(LINTERS);

	if (opts.explicit && opts.explicit.length > 0) {
		const unknown = opts.explicit.filter((n) => !LINTER_NAMES.has(n));
		if (unknown.length > 0) {
			throw new Error(
				`unknown linter${unknown.length > 1 ? "s" : ""} ${unknown.map((n) => `"${n}"`).join(", ")} — ` +
					`known: ${order.join(", ")}`
			);
		}
		const wanted = new Set(opts.explicit);
		return order.filter((n) => wanted.has(n)).map((name) => ({ name, def: LINTERS[name]! }));
	}

	const present = new Set(opts.rootFiles);
	return order
		.filter((name) => {
			const def = LINTERS[name]!;
			// Every linter is always-on XOR detect-gated (enforced by test), so
			// `detect` is defined whenever `always` is not.
			return def.always === true || def.detect!.some((f) => present.has(f));
		})
		.map((name) => ({ name, def: LINTERS[name]! }));
}
