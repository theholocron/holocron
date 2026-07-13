import { buildHeaders, buildUrl, request } from "./client.js";
import type {
	JiraClientOptions,
	JiraIssue,
	JiraIssueFields,
	JiraSearchQuery,
	JiraSearchResponse,
} from "./types.js";

export function issues(options: JiraClientOptions) {
	const headers = buildHeaders(options.token);

	return {
		create(
			title: string,
			type: string,
			project: string,
			fields: JiraIssueFields = {},
		): Promise<JiraIssue> {
			return request<JiraIssue>(buildUrl(options, "/issue/"), {
				method: "POST",
				headers,
				body: JSON.stringify({
					fields: {
						project: { key: project },
						summary: title,
						issuetype: { name: type },
						...fields,
					},
				}),
			});
		},

		get(
			ticket: string,
			params?: Record<string, string>,
		): Promise<JiraIssue> {
			return request<JiraIssue>(
				buildUrl(options, `/issue/${ticket}`, params),
				{ method: "GET", headers },
			);
		},

		getMany(
			tickets: string[],
			params?: Record<string, string>,
		): Promise<JiraIssue[]> {
			return Promise.all(tickets.map((t) => this.get(t, params)));
		},

		update(ticket: string, fields: JiraIssueFields): Promise<void> {
			return request<void>(buildUrl(options, `/issue/${ticket}`), {
				method: "PUT",
				headers,
				body: JSON.stringify({ fields }),
			});
		},

		getProperty(ticket: string, property: string): Promise<unknown> {
			return request<unknown>(
				buildUrl(options, `/issue/${ticket}/properties/${property}`),
				{
					method: "GET",
					headers,
				},
			);
		},

		search(query: JiraSearchQuery): Promise<JiraSearchResponse> {
			return request<JiraSearchResponse>(
				buildUrl(options, "/search", query as Record<string, unknown>),
				{
					method: "GET",
					headers,
				},
			);
		},
	};
}
