/**
 * Sets the organization's `Priority` issue field (Urgent, High, Medium, Low) from a record's priority, for `holocron
 * sync issues` and `holocron migrate`. The field belongs to the issue, so it works in any repo of an organization that has
 * it; the `priority: <level>` label is written as before. Spec `tech-github-issue-priority-field`, #2253.
 *
 * It is `createFieldSetter()` (`issue-field-setter.ts`, which holds the rules for reading and writing a field) with
 * Priority's option names. A record with no priority never clears a value.
 */

import type { IssuePriority } from "@theholocron/cli";
import type { GitHubClient } from "@theholocron/github-client";

import { createFieldSetter, type FieldResult } from "./issue-field-setter.js";

/** The Priority field's option for each level. */
export const PRIORITY_OPTION_NAMES: Record<Exclude<IssuePriority, "none">, string> = {
	urgent: "Urgent",
	high: "High",
	medium: "Medium",
	low: "Low",
};

/** What setting the field did for one issue. */
export type PriorityResult = FieldResult;

/** Sets the Priority field of issues in one repository. */
export interface PrioritySetter {
	/** `isNew` skips reading the issue's values (a new issue has none); `dryRun` reads and writes nothing. */
	set(
		number: number,
		level: IssuePriority | undefined,
		flags?: { isNew?: boolean; dryRun?: boolean }
	): Promise<PriorityResult>;
}

/** Makes the Priority setter for the issues of `repo` (`owner/name`). */
export function createPrioritySetter(client: GitHubClient, repo: string): PrioritySetter {
	const fields = createFieldSetter(client, repo);
	return {
		set: (number, level, flags = {}) =>
			!level || level === "none"
				? Promise.resolve({ changed: false })
				: fields.set(number, { name: "Priority", type: "select", value: PRIORITY_OPTION_NAMES[level] }, flags),
	};
}
