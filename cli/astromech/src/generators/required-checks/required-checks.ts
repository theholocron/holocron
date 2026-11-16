/**
 * `requiredChecks(config, aggregate)` — the branch-protection required-status-check list.
 *
 * With the `ci` aggregate (the repo hosts it) the ruleset is `ci / Required checks` and `DCO`: that check waits on every `required: true` task,
 * the hand-written checks and the coverage provider's required statuses ({@link aggregateChecks}), and `DCO` stays its own context
 * because it comes from the DCO app. Without it, the list is what it was before the aggregate: `DCO`, the per-task
 * contexts, then `extraRequiredChecks` ({@link taskCheckContexts}); a repo that has no `ci` caller yet must not be told
 * to require a check nobody posts.
 *
 * `statusContexts` are the statuses a `coverage` provider reports; its required ones join the list, and the aggregate
 * recognises them as statuses. `@theholocron/cli`'s `holocron setup` calls this. Policy-free — it only knows the manifest.
 */

import type { TasksConfig } from "../../config/schema/index.js";
import { type StatusContext, taskCheckContexts } from "../task-check-contexts/index.js";

/**
 * The context of the aggregate check: the caller's job (`ci`) and the called job (`Required checks`), as GitHub joins
 * them for a reusable workflow.
 */
export const AGGREGATE_CHECK = "ci / Required checks";

/** Ordered, de-duplicated. */
export function requiredChecks(
	config: TasksConfig,
	aggregate: boolean,
	statusContexts?: readonly StatusContext[]
): string[] {
	if (aggregate) return [AGGREGATE_CHECK, "DCO"];
	return [...new Set(["DCO", ...taskCheckContexts(config, statusContexts)])];
}
