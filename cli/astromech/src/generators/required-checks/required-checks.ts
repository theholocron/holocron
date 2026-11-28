/**
 * `requiredChecks(config, aggregate)` — the branch-protection required-status-check list.
 *
 * With the `ci` aggregate (the repo hosts it) the ruleset is `ci / Required checks` and the DCO check: that check waits on every `required: true` task,
 * the hand-written checks and the coverage provider's required statuses ({@link aggregateChecks}), and the DCO check stays its own context
 * (Sentinel's `validate:dco`, {@link DCO_CHECK}; it was the DCO app's `DCO` until #1044). Without it, the list is what it was before the aggregate: the DCO check, the per-task
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

/**
 * The context of the DCO check: Sentinel's `validate:dco / Run Developer Certificate of Origin`. It replaced the probot DCO
 * app's `DCO` (#1044). Required on its own, outside the aggregate.
 */
export const DCO_CHECK = "validate:dco / Run Developer Certificate of Origin";

/** Ordered, de-duplicated. */
export function requiredChecks(
	config: TasksConfig,
	aggregate: boolean,
	statusContexts?: readonly StatusContext[]
): string[] {
	if (aggregate) return [AGGREGATE_CHECK, DCO_CHECK];
	return [...new Set([DCO_CHECK, ...taskCheckContexts(config, statusContexts)])];
}
