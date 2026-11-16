import type { RestClient } from "../utils.js";
import { repoBase, segment } from "../utils.js";

/** One option of a single-select issue field. */
export interface GitHubIssueFieldOption {
	/** The option's id. */
	id: number;
	/** The option's name, which is how a value is set. */
	name: string;
}

/** An issue field an organization defines (Priority, Effort, Start date and so on). */
export interface GitHubIssueField {
	/** The field's id, which is how a value is set. */
	id: number;
	/** The field's name. */
	name: string;
	/** `single_select`, `text`, `number` or `date`. */
	data_type: string;
	/** The options of a single-select field. */
	options?: GitHubIssueFieldOption[];
}

/** The value an issue has for one field. */
export interface GitHubIssueFieldValue {
	/** The id of the field. */
	issue_field_id: number;
	/** The name of the field, when GitHub gives it. */
	issue_field_name?: string;
	/** The field's type. */
	data_type: string;
	/** The value; for a single-select field read the option from `single_select_option`. */
	value: string | number;
	/** The selected option of a single-select field, or `null`. */
	single_select_option?: { id: number; name: string; color: string } | null;
}

/** One value to set: a field's id and, for a single-select field, the option's name. */
export interface IssueFieldValueInput {
	/** The field's id. */
	field_id: number;
	/** The option's name, text, number or date. */
	value: string | number;
}

export function issueFields(rest: RestClient) {
	return {
		/** The issue fields an organization defines (read-only). */
		list: (org: string): Promise<GitHubIssueField[]> =>
			rest.request<GitHubIssueField[]>(`/orgs/${segment(org)}/issue-fields`),

		/** The values an issue has for the organization's issue fields (read-only). */
		values: (repo: string, number: number): Promise<GitHubIssueFieldValue[]> =>
			rest.request<GitHubIssueFieldValue[]>(`${repoBase(repo)}/issues/${number}/issue-field-values`),

		/**
		 * Adds values to an issue without touching the others it has. The caller needs push access to the repository.
		 * (GitHub's `PUT` on the same path replaces every value of the issue, so this client never uses it.)
		 */
		addValues: (repo: string, number: number, values: IssueFieldValueInput[]): Promise<GitHubIssueFieldValue[]> =>
			rest.request<GitHubIssueFieldValue[]>(`${repoBase(repo)}/issues/${number}/issue-field-values`, {
				method: "POST",
				body: { issue_field_values: values },
			}),

		/** Removes an issue's value for one field. */
		deleteValue: (repo: string, number: number, fieldId: number): Promise<void> =>
			rest.request<void>(`${repoBase(repo)}/issues/${number}/issue-field-values/${fieldId}`, {
				method: "DELETE",
				expectNoContent: true,
			}),
	};
}
