import { type RestClient } from "@theholocron/http-client";
import type { JiraProject } from "./types.js";

export function projects(client: RestClient) {
	return {
		get(id: string): Promise<JiraProject> {
			return client.request<JiraProject>(`/project/${id}`, {
				query: { expand: "issueTypes" },
			});
		},
	};
}
