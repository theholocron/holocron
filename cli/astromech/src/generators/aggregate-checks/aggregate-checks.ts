import type { TasksConfig } from "../../config/schema/index.js";
import { taskCheckContexts } from "../task-check-contexts/index.js";
import type { AggregateChecks } from "./aggregate-checks.type.js";

/** Commit statuses (not check runs) start with this; they go to `statuses`, polled through the status API. */
const STATUS_PREFIX = "codecov/";

/**
 * The `expected` ids and `statuses` the `ci` aggregate waits on, derived from the same list `requiredChecks()` read
 * before the aggregate: every `required: true` task, then the `extraRequiredChecks`. `DCO` is left out because it stays
 * its own required context. The ids use today's names; a later rename changes them here and costs no ruleset edit.
 */
export function aggregateChecks(config: TasksConfig): AggregateChecks {
	const expected = new Set<string>();
	const statuses = new Set<string>();
	for (const context of taskCheckContexts(config)) {
		if (context === "DCO") continue;
		if (context.startsWith(STATUS_PREFIX)) statuses.add(context);
		else expected.add(context.split(" / ")[0]!);
	}
	return { expected: [...expected], statuses: [...statuses] };
}
