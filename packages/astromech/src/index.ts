/**
 * `@theholocron/astromech` — the Holocron task runner.
 *
 * An astromech droid runs a starfighter's maintenance, diagnostics and
 * system wiring while the pilot flies. This does that for a repo: one
 * task manifest drives `holocron run` (local), `holocron run ci` (the CI
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

export { createAstromech } from "./astromech.js";
export type { Astromech, AstromechOptions, RunOptions } from "./astromech.type.js";
export {
	codecovComponentBlock,
	codecovConfig,
	createCodecovConfig,
	ensureIfNotFound,
	mergeCodecovComponents,
	readWorkspacePackages,
} from "./generators/codecov.js";
export type { WorkspacePackage } from "./generators/codecov.type.js";
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
	WORKFLOW_CHECK_CONTEXTS,
	WORKFLOW_TEMPLATES,
} from "./generators/github-action-thin-callers.js";
export type { OrgContext, PreviewConfig } from "./generators/github-action-thin-callers.type.js";
export { requiredChecks } from "./generators/required-checks.js";
export { createTsconfig } from "./generators/tsconfig.js";
export type { TsconfigOptions } from "./generators/tsconfig.type.js";
export { CI_ORDER, KNOWN_TASKS, TASKS } from "./registry.js";
export type { JobDef, LocalRunner, TaskDef } from "./registry.type.js";
export { runCi } from "./tasks/ci.js";
export type { CiJobReport, CiOptions, CiReport } from "./tasks/ci.type.js";
export type {
	DeployOnReleaseOptions,
	DeployOnReleaseReport,
	DeployOnReleaseResult,
} from "./tasks/deploy-on-release/index.js";
export { deployOnRelease } from "./tasks/deploy-on-release/index.js";
export { runGroup } from "./tasks/group.js";
export type { GroupJobReport, GroupOptions, GroupReport } from "./tasks/group.type.js";
export { matchNamespace } from "./tasks/match-namespace.js";
export { type ExecFn, type RunLogger, runTask, type RunTaskInput, type RunTaskReport } from "./tasks/run/index.js";
export {
	createIgnoreConfig as createAlexignore,
	createRcConfig as createAlexrc,
} from "./templates/configs/alexjs/index.js";
export { createConfig as createCommitMsg } from "./templates/configs/commit-msg/index.js";
export { createConfig as createDependabot } from "./templates/configs/dependabot/index.js";
export { createConfig as createDevmoji } from "./templates/configs/devmoji/index.js";
export { createConfig as createEditorconfig } from "./templates/configs/editorconfig/index.js";
export { createConfig as createEditorconfigChecker } from "./templates/configs/editorconfig-checker/index.js";
export { createConfig as createLabeler } from "./templates/configs/labeler/index.js";
export { createConfig as createPreCommit } from "./templates/configs/pre-commit/index.js";
export { createConfig as createPrePush } from "./templates/configs/pre-push/index.js";
export { createConfig as createPrepareCommitMsg } from "./templates/configs/prepare-commit-msg/index.js";
export {
	createIgnoreConfig as createYamlignore,
	createConfig as createYamllint,
} from "./templates/configs/yamllint/index.js";
export { createHeader } from "./utils/create-header.js";
export type { CreateHeaderOptions, HeaderFunctions, WorkflowHeaderFormat } from "./utils/create-header.type.js";
