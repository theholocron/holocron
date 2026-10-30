/** Minimal structural logger — `@theholocron/observability`'s `Logger` satisfies it. */
export interface RunLogger {
	debug(obj: Record<string, unknown>, msg?: string): void;
	warn(obj: Record<string, unknown>, msg?: string): void;
}

/**
 * Runs `cmd` and reports its exit code. `opts.env` is added to the child's
 * environment (on top of the parent's), e.g. `TURBO_SCM_BASE` for `--affected`.
 */
export type ExecFn = (
	cmd: string,
	args: string[],
	opts: { cwd: string; env?: Record<string, string> }
) => { exitCode: number };

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
	/** `turbo --affected`: only the packages changed since `base`, plus their dependents. Ignored without a `turbo.json`. */
	affected?: boolean;
	/** Git ref `affected` compares against; falls back to `TURBO_SCM_BASE`. */
	base?: string;
	/** Environment `affected` reads (`GITHUB_EVENT_NAME`, `GITHUB_REF_NAME`, `TURBO_SCM_BASE`). Defaults to empty. */
	env?: Record<string, string | undefined>;
	/** The task entry's `jobs` switches: a sub-job set to `false` (by key or alias) is not run. */
	jobSwitches?: Record<string, boolean>;
}

export interface RunTaskReport {
	status: "ok" | "fail" | "skip" | "dry-run" | "unknown";
	/** Resolved command, for the caller / tests. */
	command?: string;
	message?: string;
}
