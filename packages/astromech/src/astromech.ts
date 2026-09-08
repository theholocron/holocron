/**
 * `createAstromech(options)` — the self-contained task runner.
 * `@theholocron/cli` instantiates it once and delegates the `run` /
 * `ci` / workflow-generation commands to it (like `@theholocron/logger`).
 */

import type { TasksConfig } from "./config/schema.js";
import { type ExecFn, type RunLogger, runTask, type RunTaskInput, type RunTaskReport } from "./run.js";

export interface AstromechOptions {
	/** Repo root. */
	cwd: string;
	/**
	 * The resolved task manifest. Optional for `run` (which is
	 * filesystem-driven); later methods (`ci`, workflow generation) need it.
	 * Load it with `loadTasksConfig` from `@theholocron/astromech/config`.
	 */
	config?: TasksConfig;
	/** Structured-logging sink. */
	logger?: RunLogger;
	/** User-facing line printer. Defaults to `console.log`. */
	print?: (line: string) => void;
	/** Injectable subprocess runner (tests). */
	exec?: ExecFn;
	/** Injectable fs (tests). */
	readFile?: (path: string) => string;
	fileExists?: (path: string) => boolean;
	listDir?: (path: string) => string[];
}

export interface RunOptions {
	/** Args after `--`, forwarded to the tool / turbo / script. */
	passthrough?: string[];
	/** Print the resolved command without running it. */
	dryRun?: boolean;
	/** Fail (exit 1) instead of skipping when the repo has no such task. */
	required?: boolean;
}

export interface Astromech {
	/** Run one task locally. */
	run(task: string, opts?: RunOptions): RunTaskReport;
}

export function createAstromech(options: AstromechOptions): Astromech {
	// `runTask` treats every `undefined` field as "use the default", so the
	// options pass straight through.
	const base: Omit<RunTaskInput, "task"> = {
		cwd: options.cwd,
		logger: options.logger,
		print: options.print,
		exec: options.exec,
		readFile: options.readFile,
		fileExists: options.fileExists,
		listDir: options.listDir,
	};

	return {
		run: (task, opts = {}) =>
			runTask({
				...base,
				task,
				passthrough: opts.passthrough ?? [],
				dryRun: opts.dryRun ?? false,
				required: opts.required ?? false,
			}),
	};
}
