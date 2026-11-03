/**
 * `createAstromech(options)` — the self-contained task runner.
 * `@theholocron/cli` instantiates it once and delegates the `run` /
 * `ci` / workflow-generation commands to it (like `@theholocron/observability`).
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import type { Astromech, AstromechOptions } from "./astromech.type.js";
import { normalizeTaskEntry, type TaskEntry, type TasksConfig } from "./config/schema/index.js";
import {
	aggregateCaller as resolveAggregateCaller,
	aggregateChecks,
	codecovConfig as resolveCodecovConfig,
	type CodecovConfigOptions,
	deriveDeployPaths,
	ensureRootWorkspaceMember as resolveEnsureRootWorkspaceMember,
	ensureTurboDependency as resolveEnsureTurboDependency,
	extractPreviewConfig,
	generateCombinedDeployContent,
	generateThinCallerContent,
	KNOWN_WORKFLOWS,
	normalizeWorkflowWith,
	planTasks,
	requiredChecks as resolveRequiredChecks,
	reusableTemplates as resolveReusableTemplates,
	scriptsFor,
	turboConfig as resolveTurboConfig,
} from "./generators/index.js";
import { TASKS } from "./registry/index.js";
import { runCi, type RunDeps, runWords } from "./tasks/index.js";
import { noopLogger, realExec, realLookPath } from "./utils/index.js";
import { resolveTaskName, workflowKeys } from "./vocabulary/index.js";

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
	const env = options.env ?? process.env;

	const items = (): TaskEntry[] => (options.config?.tasks ?? []).map((i) => normalizeTaskEntry(i));
	const warn = options.warn ?? ((line: string) => console.error(line));

	/**
	 * Task names this repo's manifest can actually run locally — shared by
	 * {@link packageScripts} and by `holocron`'s own interactive task picker.
	 * Deliberately independent of `syncScripts`/`holocronScript`/`hooks`:
	 * those govern whether/how `package.json` scripts get *written*, not
	 * which tasks exist to run. A repo with `syncScripts: false` (this repo
	 * itself, among others) still has real runnable tasks — found live when
	 * `packageScripts()`'s `{}` short-circuit silently emptied the picker too.
	 */
	const runnableTaskNames = (): string[] => {
		const out: string[] = [];
		for (const entry of items()) {
			// `local: null` alone means genuinely no local equivalent
			// (scan:code, deploy); a `linterGroup`
			// task still runs locally even though its own `local` is null.
			const runnable = resolveTaskName(entry.name).some(({ id }) => {
				const def = TASKS[id];
				return def !== undefined && !(def.local === null && !def.linterGroup);
			});
			if (entry.local === false || !runnable) continue;
			out.push(entry.name);
		}
		return out;
	};

	/** A pnpm workspace: its root scripts call turbo, and `turbo.json` carries the suite and root tasks. */
	const hasWorkspaceFile = (): boolean => deps.fileExists(join(options.cwd, "pnpm-workspace.yaml"));
	const isMonorepo = (config: TasksConfig): boolean =>
		hasWorkspaceFile() && resolveTurboConfig(config, { monorepo: true }) !== null;

	return {
		run: (task, opts = {}) =>
			runWords({
				...deps,
				words: [task, ...(opts.job !== undefined ? [opts.job] : []), ...(opts.args ?? [])],
				cwd: options.cwd,
				...(options.config ? { config: options.config } : {}),
				passthrough: opts.passthrough ?? [],
				...(opts.check ? { check: true } : {}),
				dryRun: opts.dryRun ?? false,
				required: opts.required ?? false,
				...(opts.filter ? { filter: opts.filter } : {}),
				...(opts.affected ? { affected: true, env } : {}),
				...(opts.base ? { base: opts.base } : {}),
				warn,
			}),

		ci: (opts = {}) =>
			runCi({
				...deps,
				cwd: options.cwd,
				config: options.config ?? {},
				...(opts.affected ? { env } : {}),
				...opts,
			}),

		thinCallers: () => {
			const orgCtx = options.orgContext ?? {};
			const out = new Map<string, string>();
			// One caller per workflow an entry needs: `validate` has two, each leaf its own.
			const wanted = items().flatMap((entry) => workflowKeys(entry.name).map((key) => ({ entry, key })));
			for (const { entry, key } of wanted) {
				// `deploy`, `deploy-docs`, and `deploy-components` all
				// share the same combined production+preview reusable pair
				// (`deploy.yml` / `preview.yml`) — the two new tasks are
				// each dedicated to exactly one `type:`, so they imply the
				// corresponding `docs`/`storybook` shorthand rather than requiring
				// a repo to spell it out. Neither has a static `WORKFLOW_TEMPLATES`
				// entry (their content is always generated, never a fixed base) —
				// unlike `deploy`, which falls back to a plain
				// production-only static template when `preview` is absent, these
				// two have no such fallback to fall back to, so `preview` defaults
				// on too (not just `docs`/`storybook`) — a repo declaring
				// `deploy-docs` always gets the full production+preview
				// treatment these tasks exist for, unless it explicitly opts out
				// with `preview: false`. They're allowed through the
				// `KNOWN_WORKFLOWS` gate explicitly since neither is in it.
				// The workflow tables are keyed by the flat id of the template that carries the workflow, so an entry spelled with an
				// old name finds it, and a task that has no workflow of its own (`format`) generates no caller.
				const isDocsSite = key === "deploy-docs";
				const isComponents = key === "deploy-components";
				if (resolveTaskName(entry.name).every(({ id }) => TASKS[id]?.workflow === false)) continue;
				if (entry.ci === false || (!KNOWN_WORKFLOWS.has(key) && !isDocsSite && !isComponents)) continue;
				// A release-time deploy (`with.on: "release"`) runs from the publish
				// job (`holocron deploy-on-release`), not a push/PR workflow.
				if (key === "deploy" && entry.with?.["on"] === "release") continue;
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
					key === "test:unit" &&
					withOverrides?.["run-unit"] === false &&
					withOverrides?.["run-storybook"] === false
				) {
					throw new Error(
						'test workflow: at least one of "run-unit" or "run-storybook" must be true. ' +
							"Library repos use run-unit: true; UI/Storybook repos use run-storybook: true."
					);
				}

				const isDeployFamily = key === "deploy" || isDocsSite || isComponents;
				const additionalPaths =
					entry.paths ?? (isDeployFamily && rawWith ? deriveDeployPaths(rawWith) : undefined);

				if (isDeployFamily && rawWith) {
					const preview = extractPreviewConfig(rawWith, orgCtx);
					if (preview) {
						// `rawWith` is truthy here, so both helpers always return a value —
						// no `?? {}` / `?? []` fallback to leave half-covered.
						const deployWith = normalizeWorkflowWith(rawWith);
						const deployPaths = entry.paths ?? deriveDeployPaths(rawWith);
						out.set(`${key}.yml`, generateCombinedDeployContent(deployWith, deployPaths, preview, key));
						continue;
					}
				}
				out.set(`${key}.yml`, generateThinCallerContent(key, withOverrides, additionalPaths, deps.logger));
			}
			return out;
		},

		packageScripts: () => {
			const out: Record<string, string> = {};
			if (!options.config || options.config.syncScripts === false) return out;
			out.holocron = options.config.holocronScript ?? "holocron";
			Object.assign(out, scriptsFor(options.config, TASKS, { monorepo: isMonorepo(options.config) }));
			// Enabled hooks need `husky` to run on install to register the hook path.
			const hooks = options.config.hooks;
			const hooksOn = hooks === true || (typeof hooks === "object" && hooks.prePush !== false);
			if (hooksOn) out.prepare = "husky";
			return out;
		},

		runnableTasks: () => runnableTaskNames(),

		reusableTemplates: () => resolveReusableTemplates(),

		requiredChecks: (aggregate: boolean) => resolveRequiredChecks(options.config ?? {}, aggregate),

		aggregateCaller: () => {
			const checks = aggregateChecks(options.config ?? {});
			return checks.expected.length === 0 && checks.statuses.length === 0 ? null : resolveAggregateCaller(checks);
		},

		codecovConfig: (existing: string | null, codecov?: CodecovConfigOptions) =>
			resolveCodecovConfig(options.cwd, existing, codecov),

		turboConfig: () => resolveTurboConfig(options.config ?? {}, { monorepo: hasWorkspaceFile() }),

		ensureRootWorkspaceMember: (workspaceYaml: string, rootScripts: Readonly<Record<string, string>>) => {
			// The scripts a task fanned out by turbo can already have at the root: under its key, or its flat name.
			const taskNames = planTasks(options.config ?? {}, TASKS)
				.filter((task) => task.kind === "turbo")
				.flatMap((task) => [task.key, task.script]);
			return resolveEnsureRootWorkspaceMember(workspaceYaml, rootScripts, taskNames);
		},

		ensureTurboDependency: (packageJson: string, workspaceYaml: string) =>
			resolveEnsureTurboDependency(packageJson, workspaceYaml),
	};
}
