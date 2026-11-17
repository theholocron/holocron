/**
 * Sets the organization's `Priority` issue field (Urgent, High, Medium, Low) from a record's priority, for `holocron
 * sync issues` and `holocron migrate`. The field belongs to the issue, so it works in any repo of an organization that has
 * it; the `priority: <level>` label is written as before. Spec `tech-github-issue-priority-field`, #2253.
 *
 * The field's id is read once per run. A value is added with `POST`, which leaves the issue's other field values alone
 * (`PUT` replaces all of them, and a multi-select value cannot be sent back with certainty); a value that differs is
 * removed first. A record with no priority never clears a value. Nothing here fails a run for a reason about access: a
 * missing field, a missing option or a refusal from GitHub comes back as a `note` for the report, and a rate limit is
 * thrown for the caller to stop on.
 */

import type { IssuePriority } from "@theholocron/cli";
import { ProviderApiError } from "@theholocron/cli";
import type { GitHubClient, GitHubIssueField } from "@theholocron/github-client";

const OPTION_NAMES: Record<Exclude<IssuePriority, "none">, string> = {
	urgent: "Urgent",
	high: "High",
	medium: "Medium",
	low: "Low",
};

/** What setting the field did for one issue. */
export interface PriorityResult {
	/** Whether the field was set (on a dry run, would be). */
	changed: boolean;
	/** Why it was not set, for the report's `dropped` list; absent when nothing was wrong. */
	note?: string;
}

/** Sets the Priority field of issues in one repository. */
export interface PrioritySetter {
	/** `isNew` skips reading the issue's values (a new issue has none); `dryRun` reads and writes nothing. */
	set(
		number: number,
		level: IssuePriority | undefined,
		flags?: { isNew?: boolean; dryRun?: boolean }
	): Promise<PriorityResult>;
}

type Lookup = { field: GitHubIssueField } | { note: string };

/** Whether GitHub refused for a reason about access or setup, which a run reports and goes on from. */
function refusal(err: unknown): string | undefined {
	if (!(err instanceof ProviderApiError)) return undefined;
	if (err.status === undefined || ![401, 403, 404, 422].includes(err.status)) return undefined;
	if (/rate limit/i.test(`${err.message} ${String(err.details)}`)) return undefined;
	return `GitHub refused: ${err.status}`;
}

export function createPrioritySetter(client: GitHubClient, repo: string): PrioritySetter {
	const org = repo.split("/")[0];
	let lookup: Promise<Lookup> | undefined;
	const findField = (): Promise<Lookup> =>
		(lookup ??= client.issueFields.list(org).then(
			(fields): Lookup => {
				const field = fields.find((f) => f.name === "Priority" && f.data_type === "single_select");
				return field ? { field } : { note: `priority field (${org} has no Priority issue field)` };
			},
			(err: unknown): Lookup => {
				const why = refusal(err);
				if (why === undefined) throw err;
				return { note: `priority field (${why})` };
			}
		));

	return {
		async set(number, level, flags = {}) {
			if (!level || level === "none") return { changed: false };
			const found = await findField();
			if ("note" in found) return { changed: false, note: found.note };
			const { field } = found;
			const optionName = OPTION_NAMES[level];
			const option = field.options?.find((o) => o.name.toLowerCase() === optionName.toLowerCase());
			if (!option) return { changed: false, note: `priority field (no "${optionName}" option)` };
			try {
				const current = flags.isNew
					? undefined
					: (await client.issueFields.values(repo, number)).find((v) => v.issue_field_id === field.id);
				const currentName = current ? (current.single_select_option?.name ?? String(current.value)) : undefined;
				if (currentName?.toLowerCase() === option.name.toLowerCase()) return { changed: false };
				if (flags.dryRun) return { changed: true };
				if (current) await client.issueFields.deleteValue(repo, number, field.id);
				await client.issueFields.addValues(repo, number, [{ field_id: field.id, value: option.name }]);
				return { changed: true };
			} catch (err) {
				const why = refusal(err);
				if (why === undefined) throw err;
				return { changed: false, note: `priority field (${why})` };
			}
		},
	};
}
