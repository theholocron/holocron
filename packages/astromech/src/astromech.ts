/**
 * `createAstromech(options)` — the self-contained task runner.
 * `@theholocron/cli` instantiates it once and delegates the `run` /
 * `ci` / workflow-generation commands to it (like `@theholocron/observability`).
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";

import type { Astromech, AstromechOptions } from "./astromech.type.js";
import { normalizeTaskEntry, type TaskEntry } from "./config/schema/index.js";
import {
	codecovConfig as resolveCodecovConfig,
	deriveDeployPaths,
	ensureRootWorkspaceMember as resolveEnsureRootWorkspaceMember,
	ensureTurboDependency as resolveEnsureTurboDependency,
	extractPreviewConfig,
	generateCombinedDeployContent,
	generateThinCallerContent,
	KNOWN_WORKFLOWS,
	normalizeWorkflowWith,
	requiredChecks as resolveRequiredChecks,
	reusableTemplates as resolveReusableTemplates,
	turboConfig as resolveTurboConfig,
} from "./generators/index.js";
import { KNOWN_TASKS, TASKS } from "./registry/index.js";
import { matchNamespace, runCi, type RunDeps, runGroup, runTask } from "./tasks/index.js";
import { noopLogger, realExec, realLookPath } from "./utils/index.js";

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
			const def = TASKS[entry.name];
			// `local: null` alone means genuinely no local equivalent
			// (security.codeScanning, delivery.deploy); a `linterGroup` or `jobs`
			// task still runs locally even though its own `local` is null.
			const hasNoLocalRunner = def?.local === null && !def.linterGroup && !def.jobs;
			if (entry.local === false || !KNOWN_TASKS.has(entry.name) || hasNoLocalRunner) continue;
			out.push(entry.name);
		}
		return out;
	};

	return {
		run: (task, opts = {}) => {
			// A bare namespace (no exact TASKS entry) that prefixes one or more
			// configured tasks runs all of them — never shadows a real task
			// name, since every real entry in TASKS already has a dot-suffix.
			if (!TASKS[task] && options.config && matchNamespace(options.config, task).length > 0) {
				return runGroup({
					...deps,
					cwd: options.cwd,
					config: options.config,
					namespace: task,
					dryRun: opts.dryRun ?? false,
					...(opts.filter ? { filter: opts.filter } : {}),
				});
			}
			return runTask({
				...deps,
				task,
				cwd: options.cwd,
				...(opts.job !== undefined ? { job: opts.job } : {}),
				passthrough: opts.passthrough ?? [],
				dryRun: opts.dryRun ?? false,
				required: opts.required ?? false,
				...(opts.filter ? { filter: opts.filter } : {}),
			});
		},

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
				// A release-time deploy (`with.on: "release"`) runs from the release
				// plugin (`@theholocron/astromech/release`), not a push/PR workflow.
				if (entry.name === "delivery.deploy" && entry.with?.["on"] === "release") continue;
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
			for (const name of runnableTaskNames()) {
				// Trailing `--` matters: turbo/pnpm append extra args to a script's
				// command text directly, without inserting their own `--` — e.g.
				// `pnpm run <task> --coverage`, not `pnpm run <task> -- --coverage`.
				// Without it here, that lands as an argument to `holocron run`
				// itself ("Unknown argument: coverage"), not as passthrough to the
				// tool. A bare trailing `--` is a no-op when nothing gets appended.
				out[name] = `holocron run ${name} --`;
			}
			// Enabled hooks need `husky` to run on install to register the hook path.
			const hooks = options.config.hooks;
			const hooksOn = hooks === true || (typeof hooks === "object" && hooks.prePush !== false);
			if (hooksOn) out.prepare = "husky";
			return out;
		},

		runnableTasks: () => runnableTaskNames(),

		reusableTemplates: () => resolveReusableTemplates(),

		requiredChecks: () => resolveRequiredChecks(options.config ?? {}),

		codecovConfig: (existing: string | null) => resolveCodecovConfig(options.cwd, existing),

		turboConfig: () => resolveTurboConfig(options.config ?? {}),

		ensureRootWorkspaceMember: (workspaceYaml: string, rootScripts: Readonly<Record<string, string>>) => {
			const entries = (options.config?.tasks ?? []).map(normalizeTaskEntry);
			const taskNames = entries.filter((e) => e.local !== false).map((e) => e.name);
			return resolveEnsureRootWorkspaceMember(workspaceYaml, rootScripts, taskNames);
		},

		ensureTurboDependency: (packageJson: string, workspaceYaml: string) =>
			resolveEnsureTurboDependency(packageJson, workspaceYaml),
	};
}
