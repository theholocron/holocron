/**
 * `createAstromech(options)` — the self-contained task runner.
 * `@theholocron/cli` instantiates it once and delegates the `run` /
 * `ci` / workflow-generation commands to it (like `@theholocron/logger`).
 */

import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { type CiOptions, type CiReport, runCi } from "./ci.js";
import { normalizeTaskEntry, type TaskEntry, type TasksConfig } from "./config/schema.js";
import { KNOWN_TASKS, TASKS } from "./registry.js";
import { requiredChecks as resolveRequiredChecks } from "./required-checks.js";
import { reusableTemplates as resolveReusableTemplates } from "./reusable.js";
import { type ExecFn, type RunDeps, type RunLogger, runTask, type RunTaskReport } from "./run.js";
import {
	lintThinCallerWith,
	type SuperLinterConfig,
	superLinterConfig as resolveSuperLinterConfig,
} from "./super-linter.js";
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
	/** Injectable binary lookup (tests). Default checks `node_modules/.bin` then `PATH`. */
	lookPath?: (cwd: string, bin: string) => string | null;
}

export interface RunOptions {
	/**
	 * Sub-job within the task — `performance` in `holocron run audit
	 * performance`. Only meaningful for tasks that declare `jobs` (`audit`);
	 * ignored otherwise. Omit to run every job the task has.
	 */
	job?: string;
	/** Args after `--`, forwarded to the tool / turbo / script. */
	passthrough?: string[];
	/** Print the resolved command without running it. */
	dryRun?: boolean;
	/** Fail (exit 1) instead of skipping when the repo has no such task. */
	required?: boolean;
	/** `turbo --filter=<pkg>` passthrough (monorepo). */
	filter?: string;
}

export interface Astromech {
	/** Run one task — or one of its sub-jobs (`opts.job`) — locally. */
	run(task: string, opts?: RunOptions): RunTaskReport;
	/**
	 * Run the merge-gating checks locally, in CI order — "will CI pass?".
	 * Default scope: `required: true` tasks (falls back to every `ci: true`
	 * task when nothing is marked required). Exit non-zero on any failure.
	 */
	ci(opts?: CiOptions): CiReport;
	/**
	 * The `.github/workflows/*.yml` thin callers for this repo's manifest —
	 * `filename` → YAML content (no generated-by header; the caller adds it).
	 * One entry per `config.tasks` item that has a workflow template and is
	 * not `ci: false`.
	 */
	thinCallers(): Map<string, string>;
	/**
	 * The complete reusable-workflow batch `holocron sync-github` pushes to
	 * `theholocron/.github` — repo-relative path → content, "do not edit" header
	 * already applied to the YAML. Config-independent (the same for every repo).
	 */
	reusableTemplates(): Map<string, string>;
	/**
	 * `package.json` scripts for this repo's manifest — the `"holocron"` entry
	 * (`config.holocronScript ?? "holocron"`) plus `"<task>": "holocron run
	 * <task>"` for every `config.tasks` item that is a runnable registry task
	 * and not `local: false`. Merge into `package.json`; never clobber. Empty
	 * when there is no config or `syncScripts: false`.
	 */
	packageScripts(): Record<string, string>;
	/**
	 * The resolved super-linter env for this repo's `lint` task — the CI half
	 * of lint parity. `thinCallers()` already bakes `env` into the `lint` thin
	 * caller's `super-linter-env` input; this method exposes the full result
	 * for `holocron doctor` / diagnostics. Driven by the `lint` entry's
	 * `linters` list, else auto-detection from the repo's config files.
	 */
	superLinterConfig(): SuperLinterConfig;
	/**
	 * The branch-protection required-status-check contexts for this repo —
	 * every `required: true` task's check context plus `extraRequiredChecks`,
	 * ordered and de-duplicated. `holocron setup` prepends `"DCO"` and applies
	 * the list; this method is policy-free (manifest only).
	 */
	requiredChecks(): string[];
}

const noopLogger: RunLogger = { debug() {}, warn() {} };

const realExec: ExecFn = (cmd, args, opts) => {
	const result = spawnSync(cmd, args, { cwd: opts.cwd, stdio: "inherit" });
	return { exitCode: result.status ?? -1 };
};

/** `node_modules/.bin/<bin>`, else the first `PATH` entry that has it, else `null`. */
const realLookPath = (cwd: string, bin: string): string | null => {
	const local = join(cwd, "node_modules", ".bin", bin);
	if (existsSync(local)) return local;
	for (const dir of (process.env["PATH"] ?? "").split(":")) {
		if (dir && existsSync(join(dir, bin))) return join(dir, bin);
	}
	return null;
};

export function createAstromech(options: AstromechOptions): Astromech {
	const deps: RunDeps = {
		print: options.print ?? ((line: string) => console.log(line)),
		logger: options.logger ?? noopLogger,
		exec: options.exec ?? realExec,
		readFile: options.readFile ?? ((path: string) => readFileSync(path, "utf8")),
		fileExists: options.fileExists ?? ((path: string) => existsSync(path)),
		listDir: options.listDir ?? ((path: string) => readdirSync(path) as string[]),
		lookPath: options.lookPath ?? realLookPath,
	};

	const items = (): TaskEntry[] => (options.config?.tasks ?? []).map((i) => normalizeTaskEntry(i));

	const rootFiles = (): string[] => {
		try {
			return deps.listDir(options.cwd);
		} catch {
			return [];
		}
	};

	const lintEntry = (): TaskEntry | undefined =>
		items()
			.filter((e) => e.name === "lint")
			.at(-1);

	return {
		run: (task, opts = {}) =>
			runTask({
				...deps,
				task,
				cwd: options.cwd,
				...(opts.job !== undefined ? { job: opts.job } : {}),
				passthrough: opts.passthrough ?? [],
				dryRun: opts.dryRun ?? false,
				required: opts.required ?? false,
				...(opts.filter ? { filter: opts.filter } : {}),
				...(task === "lint" && opts.job === undefined ? { linters: lintEntry()?.linters } : {}),
			}),

		ci: (opts = {}) =>
			runCi({
				...deps,
				cwd: options.cwd,
				config: options.config ?? {},
				linters: lintEntry()?.linters,
				...opts,
			}),

		thinCallers: () => {
			const orgCtx = options.orgContext ?? {};
			const out = new Map<string, string>();
			for (const entry of items()) {
				if (entry.ci === false || !KNOWN_WORKFLOWS.has(entry.name)) continue;
				const rawWith = entry.with;
				const normalized = rawWith ? normalizeWorkflowWith(rawWith) : undefined;

				let withOverrides = normalized;
				let comments: Record<string, string> | undefined;
				if (entry.name === "lint") {
					const lint = lintThinCallerWith({
						explicit: entry.linters,
						rootFiles: rootFiles(),
						extra: normalized,
					});
					withOverrides = lint.withOverrides;
					comments = lint.comments;
				}

				if (
					entry.name === "test" &&
					withOverrides?.["run-unit"] === false &&
					withOverrides?.["run-storybook"] === false
				) {
					throw new Error(
						'test workflow: at least one of "run-unit" or "run-storybook" must be true. ' +
							"Library repos use run-unit: true; UI/Storybook repos use run-storybook: true."
					);
				}

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
					generateThinCallerContent(entry.name, withOverrides, additionalPaths, deps.logger, comments)
				);
			}
			return out;
		},

		packageScripts: () => {
			const out: Record<string, string> = {};
			if (!options.config || options.config.syncScripts === false) return out;
			out.holocron = options.config.holocronScript ?? "holocron";
			for (const entry of items()) {
				if (entry.local === false || !KNOWN_TASKS.has(entry.name) || TASKS[entry.name]?.local === null)
					continue;
				out[entry.name] = `holocron run ${entry.name}`;
			}
			// Enabled hooks need `husky` to run on install to register the hook path.
			const hooks = options.config.hooks;
			const hooksOn = hooks === true || (typeof hooks === "object" && hooks.prePush !== false);
			if (hooksOn) out.prepare = "husky";
			return out;
		},

		superLinterConfig: () => resolveSuperLinterConfig({ explicit: lintEntry()?.linters, rootFiles: rootFiles() }),

		reusableTemplates: () => resolveReusableTemplates(),

		requiredChecks: () => resolveRequiredChecks(options.config ?? {}),
	};
}
