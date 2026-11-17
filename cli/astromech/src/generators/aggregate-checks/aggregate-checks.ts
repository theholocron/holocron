import type { TasksConfig } from "../../config/schema/index.js";
import { DCO_CHECK } from "../required-checks/index.js";
import { type StatusContext, taskCheckContexts } from "../task-check-contexts/index.js";
import type { AggregateChecks } from "./aggregate-checks.type.js";

/**
 * What marks a context as a commit status (not a check run) when no provider says: the prefix Codecov's statuses
 * have. The default, so a run with no `coverage` provider loaded (`sync`, `setup`, Sentinel's checks) is unchanged.
 */
const DEFAULT_STATUS_PREFIX = "codecov/";

/**
 * The `expected` ids and `statuses` the `ci` aggregate waits on, derived from the same list `requiredChecks()` read
 * before the aggregate: every `required: true` task, then the `extraRequiredChecks`. `DCO` is left out because it stays
 * its own required context. The ids are the callers' job names, which GitHub puts before the " / " of each check they post.
 *
 * Commit statuses go to `statuses`, polled through the status API. With `statusContexts` (what a `coverage` provider
 * reports) a context is a status when the provider names it, and the provider's required ones are added; without it, a
 * context is a status when it starts with `codecov/`.
 */
export function aggregateChecks(config: TasksConfig, statusContexts?: readonly StatusContext[]): AggregateChecks {
	const known = statusContexts === undefined ? undefined : new Set(statusContexts.map((status) => status.name));
	const isStatus = (context: string) =>
		known === undefined ? context.startsWith(DEFAULT_STATUS_PREFIX) : known.has(context);
	const expected = new Set<string>();
	const statuses = new Set<string>();
	for (const context of taskCheckContexts(config, statusContexts)) {
		if (context === DCO_CHECK || context === "DCO") continue;
		if (isStatus(context)) statuses.add(context);
		else expected.add(context.split(" / ")[0]!);
	}
	return { expected: [...expected], statuses: [...statuses] };
}
