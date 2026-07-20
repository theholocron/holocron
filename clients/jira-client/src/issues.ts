import { type RestClient } from "@theholocron/http-client";
import type {
	JiraIssue,
	JiraIssueFields,
	JiraSearchQuery,
	JiraSearchResponse,
} from "./types.js";

export function issues(client: RestClient) {
	return {
		create(
			title: string,
			type: string,
			project: string,
			fields: JiraIssueFields = {},
		): Promise<JiraIssue> {
			return client.request<JiraIssue>("/issue/", {
				method: "POST",
				body: {
					fields: {
						project: { key: project },
						summary: title,
						issuetype: { name: type },
						...fields,
					},
				},
			});
		},

		get(
			ticket: string,
			params?: Record<string, string>,
		): Promise<JiraIssue> {
			return client.request<JiraIssue>(`/issue/${ticket}`, {
				query: params,
			});
		},

		getMany(
			tickets: string[],
			params?: Record<string, string>,
		): Promise<JiraIssue[]> {
			return Promise.all(tickets.map((t) => this.get(t, params)));
		},

		update(ticket: string, fields: JiraIssueFields): Promise<void> {
			return client.request<void>(`/issue/${ticket}`, {
				method: "PUT",
				body: { fields },
			});
		},

		getProperty(ticket: string, property: string): Promise<unknown> {
			return client.request<unknown>(
				`/issue/${ticket}/properties/${property}`,
			);
		},

		search(query: JiraSearchQuery = {}): Promise<JiraSearchResponse> {
			const q: Record<string, string> = {};
			if (query.jql !== undefined) q["jql"] = query.jql;
			if (query.startAt !== undefined)
				q["startAt"] = String(query.startAt);
			if (query.maxResults !== undefined)
				q["maxResults"] = String(query.maxResults);
			if (query.fields !== undefined)
				q["fields"] = query.fields.join(",");
			return client.request<JiraSearchResponse>("/search", { query: q });
		},
	};
}
