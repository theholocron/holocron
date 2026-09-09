/**
 * `requiredChecks(config)` — the branch-protection required-status-check list,
 * derived from the task manifest. Every `required: true` task contributes its
 * {@link WORKFLOW_CHECK_CONTEXTS} entry; `config.extraRequiredChecks` adds
 * contexts not backed by a task (codecov, DCO is prepended by the caller).
 *
 * `@theholocron/cli`'s `holocron setup` calls this instead of the old
 * hand-maintained `repo.requiredChecks` array. Policy-free — it only knows the
 * manifest.
 */

import { normalizeTaskEntry, type TasksConfig } from "./config/schema.js";
import { CI_ORDER } from "./registry.js";
import { WORKFLOW_CHECK_CONTEXTS } from "./thin-callers.js";

/** Ordered (task contexts in {@link CI_ORDER}, then extras), de-duplicated. */
export function requiredChecks(config: TasksConfig): string[] {
	const entries = (config.tasks ?? []).map(normalizeTaskEntry);
	const seen = new Set<string>();
	const out: string[] = [];

	for (const name of CI_ORDER) {
		const required = entries.some((e) => e.name === name && e.required === true);
		const context = required ? WORKFLOW_CHECK_CONTEXTS[name] : undefined;
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
