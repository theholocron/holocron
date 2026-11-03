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
import { isTask, workflowKey } from "../../vocabulary/index.js";
import { WORKFLOW_CHECK_CONTEXTS } from "../github-action-thin-callers/index.js";

/** Ordered (task contexts in {@link CI_ORDER}, then extras), de-duplicated. */
export function taskCheckContexts(config: TasksConfig): string[] {
	const entries = (config.tasks ?? []).map(normalizeTaskEntry);
	const seen = new Set<string>();
	const out: string[] = [];

	for (const id of CI_ORDER) {
		const required = entries.some((e) => e.required === true && isTask(e.name, id));
		// `format` has no workflow of its own: its check is a step of `lint:code`, so it adds that context (de-duplicated).
		const context = required ? WORKFLOW_CHECK_CONTEXTS[workflowKey(id)] : undefined;
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
