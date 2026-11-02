/**
 * `requiredChecks(config, aggregate)` — the branch-protection required-status-check list.
 *
 * With the `ci` aggregate (the repo hosts it) the ruleset is `ci` and `DCO`: `ci` waits on every `required: true` task,
 * the hand-written checks and the `codecov/*` statuses ({@link aggregateChecks}), and `DCO` stays its own context
 * because it comes from the DCO app. Without it, the list is what it was before the aggregate: `DCO`, the per-task
 * contexts, then `extraRequiredChecks` ({@link taskCheckContexts}); a repo that has no `ci` caller yet must not be told
 * to require a check nobody posts.
 *
 * `@theholocron/cli`'s `holocron repo setup` calls this. Policy-free — it only knows the manifest.
 */

import type { TasksConfig } from "../../config/schema/index.js";
import { taskCheckContexts } from "../task-check-contexts/index.js";

/** The name of the aggregate check. */
export const AGGREGATE_CHECK = "ci";

/** Ordered, de-duplicated. */
export function requiredChecks(config: TasksConfig, aggregate: boolean): string[] {
	if (aggregate) return [AGGREGATE_CHECK, "DCO"];
	return [...new Set(["DCO", ...taskCheckContexts(config)])];
}
