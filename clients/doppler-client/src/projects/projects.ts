import type { RestClient } from "../utils.js";

export interface DopplerProject {
	id?: string;
	name?: string;
	slug?: string;
	description?: string;
}

export interface DopplerProjectResponse {
	project?: DopplerProject;
}

export function projects(rest: RestClient) {
	return {
		create: (
			name: string,
			description?: string,
		): Promise<DopplerProjectResponse> =>
			rest.request<DopplerProjectResponse>("/projects", {
				method: "POST",
				body: {
					name,
					...(description !== undefined ? { description } : {}),
				},
			}),
	};
}
