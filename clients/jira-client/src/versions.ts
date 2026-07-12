import { buildHeaders, buildUrl, request } from "./client.js";
import type { JiraClientOptions, JiraVersion } from "./types.js";

export function versions(options: JiraClientOptions) {
	const headers = buildHeaders(options.token);

	return {
		create(name: string, project: string, fields: Partial<JiraVersion> = {}): Promise<JiraVersion> {
			return request<JiraVersion>(buildUrl(options, "/version"), {
				method: "POST",
				headers,
				body: JSON.stringify({
					name,
					project,
					startDate: new Date().toISOString(),
					...fields,
				}),
			});
		},

		get(version: string, params?: Record<string, string>): Promise<JiraVersion> {
			return request<JiraVersion>(buildUrl(options, `/version/${version}`, params), {
				method: "GET",
				headers,
			});
		},

		getMany(versionIds: string[], params?: Record<string, string>): Promise<JiraVersion[]> {
			return Promise.all(versionIds.map((v) => this.get(v, params)));
		},

		update(version: string, fields: Partial<JiraVersion>): Promise<JiraVersion> {
			return request<JiraVersion>(buildUrl(options, `/version/${version}`), {
				method: "PUT",
				headers,
				body: JSON.stringify(fields),
			});
		},

		delete(version: string): Promise<void> {
			return request<void>(buildUrl(options, `/version/${version}`), {
				method: "DELETE",
				headers,
			});
		},
	};
}
