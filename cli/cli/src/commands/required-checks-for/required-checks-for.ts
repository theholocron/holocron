import { createAstromech } from "@theholocron/astromech";
import type { TasksConfig } from "@theholocron/astromech/config";

import type { ResolvedHolocronConfig } from "../../config/index.js";
import { getLogger } from "../../observability/logger/index.js";

/**
 * The status checks a `strict` ruleset requires for the repo at `repoRoot`, derived from its task manifest exactly as
 * `holocron repo setup` writes them and `holocron doctor repo` compares them. Every repo calls the hosted `ci.yml`
 * (`ci-v1`) through the `ci` aggregate caller, so a manifest with anything for it to wait on requires `ci / Required
 * checks` and `DCO`, and the `extraRequiredChecks` are waited on by `ci` instead of listed. A manifest with nothing to
 * wait on has no `ci` caller, so it keeps the per-task contexts: a ruleset must not require a check nobody posts.
 */
export function requiredChecksFor(config: ResolvedHolocronConfig, repoRoot: string): string[] {
	const tasksConfig: TasksConfig = { tasks: config.tasks as TasksConfig["tasks"] };
	if (config.extraRequiredChecks) tasksConfig.extraRequiredChecks = config.extraRequiredChecks;
	const astromech = createAstromech({ cwd: repoRoot, config: tasksConfig, logger: getLogger() });
	return astromech.requiredChecks(astromech.aggregateCaller() !== null);
}
