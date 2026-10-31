import type { RestClient } from "../utils.js";

/** A Doppler project. */
export interface DopplerProject {
	/** The project id. */
	id?: string;
	/** The project name. */
	name?: string;
	/** The project slug. */
	slug?: string;
	/** The project description. */
	description?: string;
}

/** The response of creating a project. */
export interface DopplerProjectResponse {
	/** The project that was created. */
	project?: DopplerProject;
}

export function projects(rest: RestClient) {
	return {
		create: (name: string, description?: string): Promise<DopplerProjectResponse> =>
			rest.request<DopplerProjectResponse>("/projects", {
				method: "POST",
				body: {
					name,
					...(description !== undefined ? { description } : {}),
				},
			}),
	};
}
