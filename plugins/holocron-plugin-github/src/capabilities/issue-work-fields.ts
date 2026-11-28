/**
 * Effort, Start date and Target date of an issue on an `IssueRecord` (spec `tool-work-commands`, open question 9,
 * #2496): read from the issue's values of the organization's issue fields, and written with the field setter
 * (`issue-field-setter.ts`) only where the record carries a value, so a record without one never clears or overwrites.
 *
 * Not verified against the live API: reading these values and writing them the way Priority is written.
 */

import type { IssueEffort, IssueRecord } from "@theholocron/cli";
import type { GitHubClient, GitHubIssueField } from "@theholocron/github-client";

import { type FieldFlags, fieldRefusal, type FieldSetter, type FieldTarget } from "./issue-field-setter.js";

/** The Effort field's option for each effort. */
export const EFFORT_NAMES: Record<IssueEffort, string> = { high: "High", medium: "Medium", low: "Low" };

/** The fields of a record that come from the organization's issue fields. */
export type WorkFields = Pick<IssueRecord, "effort" | "startDate" | "targetDate">;

/** Reads the work fields of the issues of one repository. */
export interface WorkFieldReader {
	/** The issue's Effort, Start date and Target date; a field it has no value for, or an organization with none, is left out. */
	read(number: number): Promise<WorkFields>;
}

/** Makes the reader for the issues of `repo` (`owner/name`); the organization's field list is read once, on first use. */
export function createWorkFieldReader(client: GitHubClient, repo: string): WorkFieldReader {
	const org = repo.split("/")[0];
	let fields: Promise<GitHubIssueField[]> | undefined;
	const listFields = (): Promise<GitHubIssueField[]> =>
		(fields ??= client.issueFields.list(org).catch((err: unknown): GitHubIssueField[] => {
			if (fieldRefusal(err) === undefined) throw err;
			return [];
		}));
	const idOf = (list: GitHubIssueField[], name: string): number | undefined =>
		list.find((f) => f.name.toLowerCase() === name)?.id;

	return {
		async read(number) {
			const list = await listFields();
			const effortId = idOf(list, "effort");
			const startId = idOf(list, "start date");
			const targetId = idOf(list, "target date");
			if (effortId === undefined && startId === undefined && targetId === undefined) return {};
			const values = await client.issueFields.values(repo, number).catch((err: unknown) => {
				if (fieldRefusal(err) === undefined) throw err;
				return [];
			});
			const valueOf = (id: number | undefined) => values.find((v) => v.issue_field_id === id);
			const effort = (valueOf(effortId)?.single_select_option?.name ?? "").toLowerCase();
			const start = valueOf(startId);
			const target = valueOf(targetId);
			return {
				...(effort in EFFORT_NAMES ? { effort: effort as IssueEffort } : {}),
				...(start ? { startDate: String(start.value).slice(0, 10) } : {}),
				...(target ? { targetDate: String(target.value).slice(0, 10) } : {}),
			};
		},
	};
}

/** What writing a record's work fields did. */
export interface WorkFieldsResult {
	/** The names of the fields that were changed (on a dry run, would be): `effort`, `startDate`, `targetDate`. */
	changed: string[];
	/** Why a field was not set, for the report's `dropped` list. */
	notes: string[];
}

/** Sets the work fields the record carries; one it does not carry is not touched. */
export async function writeWorkFields(
	fields: FieldSetter,
	number: number,
	record: WorkFields,
	flags: FieldFlags
): Promise<WorkFieldsResult> {
	const wanted: Array<[string, FieldTarget]> = [
		["effort", { name: "Effort", type: "select", value: record.effort && EFFORT_NAMES[record.effort] }],
		["startDate", { name: "Start date", type: "date", value: record.startDate }],
		["targetDate", { name: "Target date", type: "date", value: record.targetDate }],
	];
	const out: WorkFieldsResult = { changed: [], notes: [] };
	for (const [label, target] of wanted) {
		const result = await fields.set(number, target, flags);
		if (result.note) out.notes.push(result.note);
		else if (result.changed) out.changed.push(label);
	}
	return out;
}
