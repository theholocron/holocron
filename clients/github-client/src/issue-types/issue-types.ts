import type { RestClient } from "../utils.js";
import { segment } from "../utils.js";

/** The colour words GitHub's issue Types take. */
export type IssueTypeColor = "gray" | "blue" | "green" | "yellow" | "orange" | "red" | "pink" | "purple";

/** One issue Type of an organization. */
export interface OrgIssueTypeInfo {
	/** GitHub's numeric id. */
	id: number;
	/** The Type's name. */
	name: string;
	/** One line, or `null`. */
	description?: string | null;
	/** The colour word, or `null`. */
	color?: IssueTypeColor | null;
	/** Whether new issues may take it. */
	is_enabled: boolean;
}

/** What GitHub takes when a Type is made or replaced (`name` and `is_enabled` are required). */
export interface IssueTypeInput {
	/** The Type's name. */
	name: string;
	/** Whether new issues may take it. */
	is_enabled: boolean;
	/** One line. */
	description?: string | null;
	/** The colour word. */
	color?: IssueTypeColor | null;
}

/**
 * The organization's issue Types (REST, `Issue types`). Deliberately has no `delete`: the CLI never removes a Type,
 * and a method that is not here cannot be called by mistake. The token needs the organization permission Issue types
 * (read to list, write to create or update) and, to write, an organization administrator.
 */
export function issueTypes(rest: RestClient) {
	return {
		/** The Types the organization has. */
		list: (org: string): Promise<OrgIssueTypeInfo[]> =>
			rest.request<OrgIssueTypeInfo[]>(`/orgs/${segment(org)}/issue-types`),

		/** Makes a Type. */
		create: (org: string, input: IssueTypeInput): Promise<OrgIssueTypeInfo> =>
			rest.request<OrgIssueTypeInfo>(`/orgs/${segment(org)}/issue-types`, { method: "POST", body: input }),

		/** Replaces a Type: send back the name and `is_enabled` it already has, or they change. */
		update: (org: string, id: number, input: IssueTypeInput): Promise<OrgIssueTypeInfo> =>
			rest.request<OrgIssueTypeInfo>(`/orgs/${segment(org)}/issue-types/${id}`, { method: "PUT", body: input }),
	};
}
