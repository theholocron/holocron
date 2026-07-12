import { buildHeaders, buildUrl, request } from "./client.js";
import type { JiraClientOptions, JiraIssueLinkType } from "./types.js";

export interface IssueLinkResult {
	ticket: string;
	status: number;
}

export function links(options: JiraClientOptions) {
	const headers = buildHeaders(options.token);

	return {
		create(ticket: string, link: string, type: string): Promise<number> {
			return fetch(buildUrl(options, "/issueLink"), {
				method: "POST",
				headers,
				body: JSON.stringify({
					type: { name: type },
					inwardIssue: { key: ticket },
					outwardIssue: { key: link },
				}),
			}).then((r) => r.status);
		},

		createMany(tickets: string[], link: string, type: string): Promise<IssueLinkResult[]> {
			return Promise.all(
				tickets.map(async (ticket) => ({
					ticket,
					status: await this.create(ticket, link, type),
				})),
			);
		},

		getLinkTypes(params?: Record<string, string>): Promise<{ issueLinkTypes: JiraIssueLinkType[] }> {
			return request<{ issueLinkTypes: JiraIssueLinkType[] }>(
				buildUrl(options, "/issueLinkType", params),
				{ method: "GET", headers },
			);
		},
	};
}
