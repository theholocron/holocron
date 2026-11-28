import type { RestClient } from "../utils.js";

/** A Doppler environment of a project. */
export interface DopplerEnvironment {
	/** The environment id. */
	id?: string;
	/** The environment name. */
	name?: string;
	/** The environment slug. */
	slug?: string;
}

/** The response of listing or creating environments. */
export interface DopplerEnvironmentsResponse {
	/** The environments the API returned. */
	environments?: DopplerEnvironment[];
}

export function environments(rest: RestClient) {
	return {
		list: (project: string): Promise<DopplerEnvironmentsResponse> =>
			rest.request<DopplerEnvironmentsResponse>("/environments", {
				query: { project },
			}),

		create: (project: string, name: string, slug: string): Promise<DopplerEnvironmentsResponse> =>
			rest.request<DopplerEnvironmentsResponse>("/environments", {
				method: "POST",
				body: { project, name, slug },
			}),
	};
}
