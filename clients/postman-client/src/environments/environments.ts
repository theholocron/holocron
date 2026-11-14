import type { RestClient } from "../utils.js";

/** One variable of an environment. */
export interface PostmanEnvironmentValue {
	/** The variable's name. */
	key: string;
	/** The variable's value. */
	value?: string;
	/** The variable's type, such as `default` or `secret`. */
	type?: string;
	/** Whether the variable is in use. */
	enabled?: boolean;
}

/** A Postman environment, as listed by the API. */
export interface PostmanEnvironment {
	/** The environment's id. */
	id: string;
	/** The environment's unique id, prefixed with its owner's id. */
	uid: string;
	/** The environment's name. */
	name: string;
	/** The variables; only present when one environment is fetched. */
	values?: PostmanEnvironmentValue[];
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

		get: (uid: string): Promise<PostmanEnvironmentResponse> =>
			rest.request<PostmanEnvironmentResponse>(`/environments/${encodeURIComponent(uid)}`),

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
