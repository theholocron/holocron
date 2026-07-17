import type { RestClient } from "../utils.js";

export interface DopplerEnvironment {
	id?: string;
	name?: string;
	slug?: string;
}

export interface DopplerEnvironmentsResponse {
	environments?: DopplerEnvironment[];
}

export function environments(rest: RestClient) {
	return {
		list: (project: string): Promise<DopplerEnvironmentsResponse> =>
			rest.request<DopplerEnvironmentsResponse>("/environments", {
				query: { project },
			}),

		create: (
			project: string,
			name: string,
			slug: string,
		): Promise<DopplerEnvironmentsResponse> =>
			rest.request<DopplerEnvironmentsResponse>("/environments", {
				method: "POST",
				body: { project, name, slug },
			}),
	};
}
