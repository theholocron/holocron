/**
 * `createAstromech(options)` — the self-contained task runner.
 * `@theholocron/cli` instantiates it once and delegates the `run` /
 * `ci` / workflow-generation commands to it (like `@theholocron/observability`).
 */

import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { type CiOptions, type CiReport, runCi } from "./ci.js";
import { codecovConfig as resolveCodecovConfig } from "./codecov.js";
import { normalizeTaskEntry, type TaskEntry, type TasksConfig } from "./config/schema.js";
import { KNOWN_TASKS, TASKS } from "./registry.js";
import { requiredChecks as resolveRequiredChecks } from "./required-checks.js";
import { reusableTemplates as resolveReusableTemplates } from "./reusable.js";
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
import { turboConfig as resolveTurboConfig } from "./turbo.js";

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
	 * The branch-protection required-status-check contexts for this repo —
	 * every `required: true` task's check context plus `extraRequiredChecks`,
	 * ordered and de-duplicated. `holocron setup` prepends `"DCO"` and applies
	 * the list; this method is policy-free (manifest only).
	 */
	requiredChecks(): string[];
	/**
	 * This repo's `codecov.yml` — component `paths` derived from `packages/*`.
	 * Pass the current file's content (`null` if none exists yet) to either
	 * merge the component list in or scaffold a fresh file. Policy-free same
	 * as {@link requiredChecks} — `holocron setup` owns writing the result.
	 */
	codecovConfig(existing: string | null): string;
	/**
	 * The generated `turbo.json` for this repo's manifest, pretty-printed —
	 * write directly, no merge. `null` when no manifest task has turbo fan-out
	 * config (nothing to write). See {@link TurboTaskConfig} in `registry.ts`.
	 */
	turboConfig(): string | null;
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
			}),

		ci: (opts = {}) =>
			runCi({
				...deps,
				cwd: options.cwd,
				config: options.config ?? {},
				...opts,
			}),

		thinCallers: () => {
			const orgCtx = options.orgContext ?? {};
			const out = new Map<string, string>();
			for (const entry of items()) {
				// `delivery.deploy`, `knowledge.docs`, and `knowledge.components` all
				// share the same combined production+preview reusable pair
				// (`delivery.deploy.yml` / `preview.yml`) — the two new tasks are
				// each dedicated to exactly one `type:`, so they imply the
				// corresponding `docs`/`storybook` shorthand rather than requiring
				// a repo to spell it out. Neither has a static `WORKFLOW_TEMPLATES`
				// entry (their content is always generated, never a fixed base) —
				// unlike `delivery.deploy`, which falls back to a plain
				// production-only static template when `preview` is absent, these
				// two have no such fallback to fall back to, so `preview` defaults
				// on too (not just `docs`/`storybook`) — a repo declaring
				// `knowledge.docs` always gets the full production+preview
				// treatment these tasks exist for, unless it explicitly opts out
				// with `preview: false`. They're allowed through the
				// `KNOWN_WORKFLOWS` gate explicitly since neither is in it.
				const isDocsSite = entry.name === "knowledge.docs";
				const isComponents = entry.name === "knowledge.components";
				if (entry.ci === false || (!KNOWN_WORKFLOWS.has(entry.name) && !isDocsSite && !isComponents)) continue;
				const rawWith: Record<string, unknown> | undefined = isDocsSite
					? { preview: true, ...entry.with, docs: entry.with?.["docs"] ?? true }
					: isComponents
						? {
								preview: true,
								...entry.with,
								storybook: entry.with?.["storybook"] ?? [{ workingDir: "." }],
							}
						: entry.with;
				const normalized = rawWith ? normalizeWorkflowWith(rawWith) : undefined;

				const withOverrides = normalized;

				if (
					entry.name === "verification.unitTests" &&
					withOverrides?.["run-unit"] === false &&
					withOverrides?.["run-storybook"] === false
				) {
					throw new Error(
						'test workflow: at least one of "run-unit" or "run-storybook" must be true. ' +
							"Library repos use run-unit: true; UI/Storybook repos use run-storybook: true."
					);
				}

				const isDeployFamily = entry.name === "delivery.deploy" || isDocsSite || isComponents;
				const additionalPaths =
					entry.paths ?? (isDeployFamily && rawWith ? deriveDeployPaths(rawWith) : undefined);

				if (isDeployFamily && rawWith) {
					const preview = extractPreviewConfig(rawWith, orgCtx);
					if (preview) {
						// `rawWith` is truthy here, so both helpers always return a value —
						// no `?? {}` / `?? []` fallback to leave half-covered.
						const deployWith = normalizeWorkflowWith(rawWith);
						const deployPaths = entry.paths ?? deriveDeployPaths(rawWith);
						out.set(`${entry.name}.yml`, generateCombinedDeployContent(deployWith, deployPaths, preview));
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
			if (!options.config || options.config.syncScripts === false) return out;
			out.holocron = options.config.holocronScript ?? "holocron";
			for (const entry of items()) {
				const def = TASKS[entry.name];
				// `local: null` alone means genuinely no local equivalent
				// (security.codeScanning, delivery.deploy); a `linterGroup` or `jobs`
				// task still runs locally even though its own `local` is null.
				const hasNoLocalRunner = def?.local === null && !def.linterGroup && !def.jobs;
				if (entry.local === false || !KNOWN_TASKS.has(entry.name) || hasNoLocalRunner) continue;
				// Trailing `--` matters: turbo/pnpm append extra args to a script's
				// command text directly, without inserting their own `--` — e.g.
				// `pnpm run <task> --coverage`, not `pnpm run <task> -- --coverage`.
				// Without it here, that lands as an argument to `holocron run`
				// itself ("Unknown argument: coverage"), not as passthrough to the
				// tool. A bare trailing `--` is a no-op when nothing gets appended.
				out[entry.name] = `holocron run ${entry.name} --`;
			}
			// Enabled hooks need `husky` to run on install to register the hook path.
			const hooks = options.config.hooks;
			const hooksOn = hooks === true || (typeof hooks === "object" && hooks.prePush !== false);
			if (hooksOn) out.prepare = "husky";
			return out;
		},

		reusableTemplates: () => resolveReusableTemplates(),

		requiredChecks: () => resolveRequiredChecks(options.config ?? {}),

		codecovConfig: (existing: string | null) => resolveCodecovConfig(options.cwd, existing),

		turboConfig: () => resolveTurboConfig(options.config ?? {}),
	};
}
