/**
 * `createAstromech(options)` — the self-contained task runner.
 * `@theholocron/cli` instantiates it once and delegates the `run` /
 * `ci` / workflow-generation commands to it (like `@theholocron/logger`).
 */

import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";

import { normalizeTaskEntry, type TaskEntry, type TasksConfig } from "./config/schema.js";
import { KNOWN_TASKS, TASKS } from "./registry.js";
import { type ExecFn, type RunDeps, type RunLogger, runTask, type RunTaskReport } from "./run.js";
import {
	deriveDeployPaths,
	extractPreviewConfig,
	generateCombinedDeployContent,
	generateThinCallerContent,
	KNOWN_WORKFLOWS,
	normalizeWorkflowWith,
	type OrgContext,
} from "./thin-callers.js";

export interface AstromechOptions {
	/** Repo root. */
	cwd: string;
	/**
	 * The resolved task manifest. Optional for `run` (which is
	 * filesystem-driven); `thinCallers` / `packageScripts` / `ci` need it.
	 * Load it with `loadTasksConfig` from `@theholocron/astromech/config`.
	 */
	config?: TasksConfig;
	/**
	 * Org context for the `deploy` workflow's `preview:` shorthand — used to
	 * derive the Cloudflare Pages project / domain when they are not spelt out.
	 */
	orgContext?: OrgContext;
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
	/**
	 * The `.github/workflows/*.yml` thin callers for this repo's manifest —
	 * `filename` → YAML content (no generated-by header; the caller adds it).
	 * One entry per `config.tasks` item that has a workflow template and is
	 * not `ci: false`.
	 */
	thinCallers(): Map<string, string>;
	/**
	 * `package.json` scripts for this repo's manifest — `"<task>": "holocron
	 * run <task>"` for every `config.tasks` item that is a runnable registry
	 * task and not `local: false`. Merge into `package.json`; never clobber.
	 */
	packageScripts(): Record<string, string>;
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

	const items = (): TaskEntry[] => (options.config?.tasks ?? []).map((i) => normalizeTaskEntry(i));

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

		thinCallers: () => {
			const orgCtx = options.orgContext ?? {};
			const out = new Map<string, string>();
			for (const entry of items()) {
				if (entry.ci === false || !KNOWN_WORKFLOWS.has(entry.name)) continue;
				const rawWith = entry.with;
				const normalized = rawWith ? normalizeWorkflowWith(rawWith) : undefined;
				const withOverrides =
					entry.name === "lint" ? { "enable-auto-commit": true, ...(normalized ?? {}) } : normalized;
				const additionalPaths =
					entry.paths ?? (entry.name === "deploy" && rawWith ? deriveDeployPaths(rawWith) : undefined);

				if (entry.name === "deploy" && rawWith) {
					const preview = extractPreviewConfig(rawWith, orgCtx);
					if (preview) {
						// `rawWith` is truthy here, so both helpers always return a value —
						// no `?? {}` / `?? []` fallback to leave half-covered.
						const deployWith = normalizeWorkflowWith(rawWith);
						const deployPaths = entry.paths ?? deriveDeployPaths(rawWith);
						out.set("deploy.yml", generateCombinedDeployContent(deployWith, deployPaths, preview));
						continue;
					}
				}
				out.set(
					`${entry.name}.yml`,
					generateThinCallerContent(entry.name, withOverrides, additionalPaths, deps.logger)
				);
			}
			return out;
		},

		packageScripts: () => {
			const out: Record<string, string> = {};
			for (const entry of items()) {
				if (entry.local === false || !KNOWN_TASKS.has(entry.name) || TASKS[entry.name]?.local === null)
					continue;
				out[entry.name] = `holocron run ${entry.name}`;
			}
			return out;
		},
	};
}
