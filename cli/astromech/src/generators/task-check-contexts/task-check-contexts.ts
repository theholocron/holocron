/**
 * `taskCheckContexts(config)` — the per-task check contexts of the task manifest. Every `required: true` task
 * contributes its {@link WORKFLOW_CHECK_CONTEXTS} entry; `config.extraRequiredChecks` adds contexts not backed by a
 * task (codecov, hand-written workflows).
 *
 * This is what the `ci` aggregate waits on (`aggregateChecks`); a ruleset lists it only in a repo that does not host
 * the aggregate yet (see `requiredChecks`). Policy-free — it only knows the manifest.
 */

import { normalizeTaskEntry, type TasksConfig } from "../../config/schema/index.js";
import { CI_ORDER } from "../../registry/index.js";
import { isTask, legacyName } from "../../vocabulary/index.js";
import { WORKFLOW_CHECK_CONTEXTS } from "../github-action-thin-callers/index.js";

/** Ordered (task contexts in {@link CI_ORDER}, then extras), de-duplicated. */
export function taskCheckContexts(config: TasksConfig): string[] {
	const entries = (config.tasks ?? []).map(normalizeTaskEntry);
	const seen = new Set<string>();
	const out: string[] = [];

	for (const id of CI_ORDER) {
		const required = entries.some((e) => e.required === true && isTask(e.name, id));
		// Until the workflows are renamed, a check is still posted under the old name's workflow.
		const legacy = legacyName(id);
		const context = required && legacy !== undefined ? WORKFLOW_CHECK_CONTEXTS[legacy] : undefined;
		if (context && !seen.has(context)) {
			seen.add(context);
			out.push(context);
		}
	}

	for (const context of config.extraRequiredChecks ?? []) {
		if (!seen.has(context)) {
			seen.add(context);
			out.push(context);
		}
	}

	return out;
}
