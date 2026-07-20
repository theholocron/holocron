import { ProviderApiError, type RestClient } from "@theholocron/http-client";
import type { JiraIssueLinkType } from "./types.js";

export interface IssueLinkResult {
	ticket: string;
	status: number;
}

export function links(client: RestClient) {
	return {
		// Returns a status code rather than throwing so createMany can collect
		// partial success/failure across a batch. Jira's POST /issueLink always
		// responds with 201 Created on success (per the REST API v2 spec), so
		// that value is returned for the happy path; error statuses from
		// ProviderApiError are surfaced verbatim.
		async create(
			ticket: string,
			link: string,
			type: string,
		): Promise<number> {
			try {
				await client.request<undefined>("/issueLink", {
					method: "POST",
					body: {
						type: { name: type },
						inwardIssue: { key: ticket },
						outwardIssue: { key: link },
					},
				});
				return 201; // Jira issueLink always returns 201 on success
			} catch (err) {
				// Only swallow real HTTP error statuses so createMany can record
				// partial failures. status 0 means a transport/network failure
				// (fetch itself rejected) — rethrow so the batch rejects too.
				if (
					err instanceof ProviderApiError &&
					err.status !== undefined &&
					err.status > 0
				)
					return err.status;
				throw err;
			}
		},

		createMany(
			tickets: string[],
			link: string,
			type: string,
		): Promise<IssueLinkResult[]> {
			return Promise.all(
				tickets.map(async (ticket) => ({
					ticket,
					status: await this.create(ticket, link, type),
				})),
			);
		},

		getLinkTypes(
			params?: Record<string, string>,
		): Promise<{ issueLinkTypes: JiraIssueLinkType[] }> {
			return client.request<{ issueLinkTypes: JiraIssueLinkType[] }>(
				"/issueLinkType",
				{ query: params },
			);
		},
	};
}
