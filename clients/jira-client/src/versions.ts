import { type RestClient } from "@theholocron/http-client";
import type { JiraVersion } from "./types.js";

export function versions(client: RestClient) {
	return {
		create(
			name: string,
			project: string,
			fields: Partial<JiraVersion> = {},
		): Promise<JiraVersion> {
			return client.request<JiraVersion>("/version", {
				method: "POST",
				body: {
					name,
					project,
					startDate: new Date().toISOString(),
					...fields,
				},
			});
		},

		get(
			version: string,
			params?: Record<string, string>,
		): Promise<JiraVersion> {
			return client.request<JiraVersion>(`/version/${version}`, {
				query: params,
			});
		},

		getMany(
			versionIds: string[],
			params?: Record<string, string>,
		): Promise<JiraVersion[]> {
			return Promise.all(versionIds.map((v) => this.get(v, params)));
		},

		update(
			version: string,
			fields: Partial<JiraVersion>,
		): Promise<JiraVersion> {
			return client.request<JiraVersion>(`/version/${version}`, {
				method: "PUT",
				body: fields,
			});
		},

		delete(version: string): Promise<void> {
			return client.request<void>(`/version/${version}`, {
				method: "DELETE",
			});
		},
	};
}
