import { buildHeaders, buildUrl, request } from "./client.js";
import type {
	JiraClientOptions,
	JiraIssueFields,
	JiraResolution,
	JiraTransition,
} from "./types.js";

export function transitions(options: JiraClientOptions) {
	const headers = buildHeaders(options.token);

	return {
		create(
			ticket: string,
			statusId: string,
			fields: JiraIssueFields = {},
		): Promise<void> {
			return request<void>(
				buildUrl(options, `/issue/${ticket}/transitions`),
				{
					method: "POST",
					headers,
					body: JSON.stringify({
						transition: { id: statusId },
						fields,
					}),
				},
			);
		},

		get(ticket: string): Promise<{ transitions: JiraTransition[] }> {
			return request<{ transitions: JiraTransition[] }>(
				buildUrl(options, `/issue/${ticket}/transitions`),
				{ method: "GET", headers },
			);
		},

		getResolutions(): Promise<JiraResolution[]> {
			return request<JiraResolution[]>(buildUrl(options, "/resolution"), {
				method: "GET",
				headers,
			});
		},
	};
}
