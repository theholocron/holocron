import type { RestClient } from "../utils.js";

/** A Postman environment, as listed by the API. */
export interface PostmanEnvironment {
	/** The environment's id. */
	id: string;
	/** The environment's unique id, prefixed with its owner's id. */
	uid: string;
	/** The environment's name. */
	name: string;
}

/** The response of listing environments. */
export interface PostmanEnvironmentsResponse {
	/** The environments returned. */
	environments: PostmanEnvironment[];
}

/** The response of fetching or creating one environment. */
export interface PostmanEnvironmentResponse {
	/** The environment. */
	environment: PostmanEnvironment;
}

export function environments(rest: RestClient) {
	return {
		list: (workspaceId: string): Promise<PostmanEnvironmentsResponse> =>
			rest.request<PostmanEnvironmentsResponse>("/environments", {
				query: { workspace: workspaceId },
			}),

		create: (workspaceId: string, environment: unknown): Promise<PostmanEnvironmentResponse> =>
			rest.request<PostmanEnvironmentResponse>("/environments", {
				method: "POST",
				query: { workspace: workspaceId },
				body: { environment },
			}),

		update: (uid: string, environment: unknown): Promise<PostmanEnvironmentResponse> =>
			rest.request<PostmanEnvironmentResponse>(`/environments/${encodeURIComponent(uid)}`, {
				method: "PUT",
				body: { environment },
			}),
	};
}
