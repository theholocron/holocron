/**
 * Sets and clears one organization issue field (Priority, Effort, Start date, Target date) on an issue, for the
 * `issues` capability's `create` and `update` and for `createPrioritySetter()`.
 *
 * The field list is read once per setter. A value is added with `POST`, which leaves the issue's other field values
 * alone (`PUT` replaces all of them, and a multi-select value cannot be sent back with certainty); a value that differs
 * is removed first. A missing field, a missing option or a refusal from GitHub (401, 403, 404, 422) comes back as a
 * `note` for the caller's `dropped` list; a rate limit and every other failure are thrown. Spec
 * `tech-github-issue-priority-field`, #2253, and `tool-work-commands`, #2429.
 *
 * Not verified against the live API: that Effort, Start date and Target date are written the way Priority is.
 */

import { ProviderApiError } from "@theholocron/cli";
import type { GitHubClient, GitHubIssueField } from "@theholocron/github-client";

/** What setting or clearing a field did for one issue. */
export interface FieldResult {
	/** Whether the field was changed (on a dry run, would be). */
	changed: boolean;
	/** Why it was not set, for the report's `dropped` list; absent when nothing was wrong. */
	note?: string;
}

/** Which field to write: its name in the organization, how it is typed, and the value for `set`. */
export interface FieldTarget {
	/** The field's name in the organization, matched without regard to case (`Priority`, `Effort`, `Start date`). */
	name: string;
	/** `select` is a single-select field set by an option's name, `date` a date field set by `YYYY-MM-DD`. */
	type: "select" | "date";
	/** The option's name, or the date; used by `set` only. */
	value?: string;
}

/** What a caller can say about one write. */
export interface FieldFlags {
	/** The issue is new, so its values are not read (it has none). */
	isNew?: boolean;
	/** Read and write nothing; say whether it would change. */
	dryRun?: boolean;
}

/** Sets and clears fields of the issues of one repository. */
export interface FieldSetter {
	/** Puts `target.value` in the field, replacing a different one. */
	set(number: number, target: FieldTarget, flags?: FieldFlags): Promise<FieldResult>;
	/** Removes the issue's value for the field; nothing when it has none. */
	clear(number: number, target: FieldTarget, flags?: FieldFlags): Promise<FieldResult>;
}

type Lookup = { field: GitHubIssueField } | { note: string };

/** Whether GitHub refused for a reason about access or setup, which a run reports and goes on from. */
export function fieldRefusal(err: unknown): string | undefined {
	if (!(err instanceof ProviderApiError)) return undefined;
	if (err.status === undefined || ![401, 403, 404, 422].includes(err.status)) return undefined;
	if (/rate limit/i.test(`${err.message} ${String(err.details)}`)) return undefined;
	return `GitHub refused: ${err.status}`;
}

const DATA_TYPE = { select: "single_select", date: "date" } as const;

/** Makes the setter for the issues of `repo` (`owner/name`); the organization's field list is read on first use and kept. */
export function createFieldSetter(client: GitHubClient, repo: string): FieldSetter {
	const org = repo.split("/")[0];
	let fields: Promise<GitHubIssueField[] | string> | undefined;
	const listFields = (): Promise<GitHubIssueField[] | string> =>
		(fields ??= client.issueFields.list(org).then(
			(list): GitHubIssueField[] | string => list,
			(err: unknown): string => {
				const why = fieldRefusal(err);
				if (why === undefined) throw err;
				return why;
			}
		));
	const label = (target: FieldTarget) => `${target.name.toLowerCase()} field`;
	const find = async (target: FieldTarget): Promise<Lookup> => {
		const list = await listFields();
		if (typeof list === "string") return { note: `${label(target)} (${list})` };
		const field = list.find(
			(f) => f.name.toLowerCase() === target.name.toLowerCase() && f.data_type === DATA_TYPE[target.type]
		);
		return field ? { field } : { note: `${label(target)} (${org} has no ${target.name} issue field)` };
	};
	const currentOf = async (number: number, field: GitHubIssueField, target: FieldTarget, flags: FieldFlags) => {
		if (flags.isNew) return undefined;
		const found = (await client.issueFields.values(repo, number)).find((v) => v.issue_field_id === field.id);
		if (!found) return undefined;
		return target.type === "date"
			? String(found.value).slice(0, 10)
			: (found.single_select_option?.name ?? String(found.value));
	};

	return {
		async set(number, target, flags = {}) {
			if (!target.value) return { changed: false };
			const found = await find(target);
			if ("note" in found) return { changed: false, note: found.note };
			const { field } = found;
			let value = target.value;
			if (target.type === "select") {
				const option = field.options?.find((o) => o.name.toLowerCase() === value.toLowerCase());
				if (!option) return { changed: false, note: `${label(target)} (no "${value}" option)` };
				value = option.name;
			}
			try {
				const current = await currentOf(number, field, target, flags);
				if (current?.toLowerCase() === value.toLowerCase()) return { changed: false };
				if (flags.dryRun) return { changed: true };
				if (current !== undefined) await client.issueFields.deleteValue(repo, number, field.id);
				await client.issueFields.addValues(repo, number, [{ field_id: field.id, value }]);
				return { changed: true };
			} catch (err) {
				const why = fieldRefusal(err);
				if (why === undefined) throw err;
				return { changed: false, note: `${label(target)} (${why})` };
			}
		},

		async clear(number, target, flags = {}) {
			if (flags.isNew) return { changed: false };
			const found = await find(target);
			if ("note" in found) return { changed: false, note: found.note };
			try {
				if ((await currentOf(number, found.field, target, flags)) === undefined) return { changed: false };
				if (flags.dryRun) return { changed: true };
				await client.issueFields.deleteValue(repo, number, found.field.id);
				return { changed: true };
			} catch (err) {
				const why = fieldRefusal(err);
				if (why === undefined) throw err;
				return { changed: false, note: `${label(target)} (${why})` };
			}
		},
	};
}
