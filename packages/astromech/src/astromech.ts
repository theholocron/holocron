/**
 * `createAstromech(options)` — the self-contained task runner.
 * `@theholocron/cli` instantiates it once and delegates the `run` /
 * `ci` / workflow-generation commands to it (like `@theholocron/logger`).
 */

import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";

import type { TasksConfig } from "./config/schema.js";
import { type ExecFn, type RunDeps, type RunLogger, runTask, type RunTaskReport } from "./run.js";

export interface AstromechOptions {
	/** Repo root. */
	cwd: string;
	/**
	 * The resolved task manifest. Optional for `run` (which is
	 * filesystem-driven); later methods (`ci`, workflow generation) need it.
	 * Load it with `loadTasksConfig` from `@theholocron/astromech/config`.
	 */
	config?: TasksConfig;
	/** Structured-logging sink. Defaults to a no-op. */
	logger?: RunLogger;
	/** User-facing line printer. Defaults to `console.log`. */
	print?: (line: string) => void;
	/** Injectable subprocess runner (tests). Defaults to `spawnSync` (stdio inherit). */
	exec?: ExecFn;
	/** Injectable fs (tests). Default to `node:fs`. */
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

const noopLogger: RunLogger = { debug() {}, warn() {} };

const realExec: ExecFn = (cmd, args, opts) => {
	const result = spawnSync(cmd, args, { cwd: opts.cwd, stdio: "inherit" });
	return { exitCode: result.status ?? -1 };
};

export function createAstromech(options: AstromechOptions): Astromech {
	const deps: RunDeps = {
		print: options.print ?? ((line: string) => console.log(line)),
		logger: options.logger ?? noopLogger,
		exec: options.exec ?? realExec,
		readFile: options.readFile ?? ((path: string) => readFileSync(path, "utf8")),
		fileExists: options.fileExists ?? ((path: string) => existsSync(path)),
		listDir: options.listDir ?? ((path: string) => readdirSync(path) as string[]),
	};

	return {
		run: (task, opts = {}) =>
			runTask({
				...deps,
				task,
				cwd: options.cwd,
				passthrough: opts.passthrough ?? [],
				dryRun: opts.dryRun ?? false,
				required: opts.required ?? false,
			}),
	};
}
