import { type RestClient } from "@theholocron/http-client";
import type {
	JiraIssueFields,
	JiraResolution,
	JiraTransition,
} from "./types.js";

export function transitions(client: RestClient) {
	return {
		create(
			ticket: string,
			statusId: string,
			fields: JiraIssueFields = {},
		): Promise<void> {
			return client.request<void>(`/issue/${ticket}/transitions`, {
				method: "POST",
				body: { transition: { id: statusId }, fields },
			});
		},

		get(ticket: string): Promise<{ transitions: JiraTransition[] }> {
			return client.request<{ transitions: JiraTransition[] }>(
				`/issue/${ticket}/transitions`,
			);
		},

		getResolutions(): Promise<JiraResolution[]> {
			return client.request<JiraResolution[]>("/resolution");
		},
	};
}
