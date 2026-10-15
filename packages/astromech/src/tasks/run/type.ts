/** Minimal structural logger — `@theholocron/observability`'s `Logger` satisfies it. */
export interface RunLogger {
	debug(obj: Record<string, unknown>, msg?: string): void;
	warn(obj: Record<string, unknown>, msg?: string): void;
}

export type ExecFn = (cmd: string, args: string[], opts: { cwd: string }) => { exitCode: number };

/**
 * Everything `runTask` needs from the outside world. `createAstromech`
 * fills these with real implementations (or the caller's injected ones);
 * `runTask` never reaches for a global itself, so it has no default
 * branches to leave untested.
 */
export interface RunDeps {
	print: (line: string) => void;
	logger: RunLogger;
	exec: ExecFn;
	readFile: (path: string) => string;
	fileExists: (path: string) => boolean;
	listDir: (path: string) => string[];
	/** `node_modules/.bin/<bin>` or a PATH entry; `null` when not runnable. */
	lookPath: (cwd: string, bin: string) => string | null;
}

export interface RunTaskInput extends RunDeps {
	/** Registry task name, e.g. `"test"`. */
	task: string;
	/**
	 * Sub-job within the task, e.g. `"performance"` in `holocron run audit
	 * performance`. Ignored (folded into `passthrough`) for tasks with no `jobs`.
	 */
	job?: string;
	/** Directory to run in. */
	cwd: string;
	/** Args after `--` on the command line, forwarded to the tool / turbo / script. */
	passthrough?: string[];
	/** Print the resolved command without running it. */
	dryRun?: boolean;
	/** Turn "no such task for this repo" (normally exit 0) into a failure. */
	required?: boolean;
	/** `turbo --filter=<pkg>` passthrough (monorepo). Ignored when the repo has no `turbo.json`. */
	filter?: string;
}

export interface RunTaskReport {
	status: "ok" | "fail" | "skip" | "dry-run" | "unknown";
	/** Resolved command, for the caller / tests. */
	command?: string;
	message?: string;
}

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

export interface ResolverDeps {
	readFile: (path: string) => string;
	fileExists: (path: string) => boolean;
}

export interface ToolConfigSpec {
	/** `@theholocron/*-config` package name. */
	package: string;
	/** `package.json#exports` subpath key — `"."` or `"./bundles/library"`. */
	exportPath: string;
	/** Flag(s) to prepend before the resolved path, e.g. `["--config"]`. */
	flag: string[];
}
