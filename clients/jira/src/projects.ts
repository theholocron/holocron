import { buildHeaders, buildUrl, request } from "./client.js";
import type { JiraClientOptions, JiraProject } from "./types.js";

export function projects(options: JiraClientOptions) {
	const headers = buildHeaders(options.token);

	return {
		get(id: string): Promise<JiraProject> {
			return request<JiraProject>(buildUrl(options, `/project/${id}`, { expand: "issueTypes" }), {
				method: "GET",
				headers,
			});
		},
	};
}
