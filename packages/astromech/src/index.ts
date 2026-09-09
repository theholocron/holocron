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
export { type CiJobReport, type CiOptions, type CiReport, runCi } from "./ci.js";
export { LINTER_NAMES, type LinterDef, LINTERS, resolveLinters } from "./linters.js";
export { CI_ORDER, KNOWN_TASKS, type LocalRunner, type TaskDef, TASKS } from "./registry.js";
export { requiredChecks } from "./required-checks.js";
export { type ExecFn, type RunLogger, runTask, type RunTaskInput, type RunTaskReport } from "./run.js";
export {
	baselineSuperLinterEnv,
	lintThinCallerWith,
	type SuperLinterConfig,
	superLinterConfig,
} from "./super-linter.js";
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
} from "./thin-callers.js";
