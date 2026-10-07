/**
 * `@theholocron/astromech` — the Holocron task runner.
 *
 * An astromech droid runs a starfighter's maintenance, diagnostics and
 * system wiring while the pilot flies. This does that for a repo: one
 * task manifest drives `holocron run` (local), `holocron ci` (the CI
 * suite locally), the generated GitHub Actions workflows, the
 * `package.json` scripts, the linter set, and the required-checks list.
 *
 * A plain library — not a capability plugin. `@theholocron/cli` depends
 * on it and instantiates it once.
 *
 * ```ts
 * import { createAstromech } from "@theholocron/astromech";
 *
 * const astromech = createAstromech({ cwd });
 * const report = astromech.run("test", { passthrough: ["--watch"] });
 * ```
 *
 * The config surface (`defineConfig`, `TasksConfig`, `loadTasksConfig`)
 * lives in the zero-runtime-dep `@theholocron/astromech/config` subpath.
 */

export { type Astromech, type AstromechOptions, createAstromech, type RunOptions } from "./astromech.js";
export {
	codecovComponentBlock,
	codecovConfig,
	createCodecovConfig,
	ensureIfNotFound,
	mergeCodecovComponents,
	readWorkspacePackages,
	type WorkspacePackage,
} from "./generators/codecov.js";
export {
	REUSABLE_ACTIONS,
	REUSABLE_WORKFLOWS,
	reusableTemplates,
	WORKFLOW_TEMPLATE_PROPERTIES,
} from "./generators/github-action-reusable-workflows.js";
export {
	deriveDeployPaths,
	extractPreviewConfig,
	generateCombinedDeployContent,
	generateThinCallerContent,
	KNOWN_WORKFLOWS,
	normalizeWorkflowWith,
	type OrgContext,
	type PreviewConfig,
	WORKFLOW_CHECK_CONTEXTS,
	WORKFLOW_TEMPLATES,
} from "./generators/github-action-thin-callers.js";
export { requiredChecks } from "./generators/required-checks.js";
export { createTsconfig, type TsconfigOptions } from "./generators/tsconfig.js";
export { CI_ORDER, type JobDef, KNOWN_TASKS, type LocalRunner, type TaskDef, TASKS } from "./registry.js";
export { type CiJobReport, type CiOptions, type CiReport, runCi } from "./tasks/ci.js";
export {
	deployOnRelease,
	type DeployOnReleaseOptions,
	type DeployOnReleaseReport,
	type DeployOnReleaseResult,
} from "./tasks/deploy-on-release.js";
export { type ExecFn, type RunLogger, runTask, type RunTaskInput, type RunTaskReport } from "./tasks/run/index.js";
