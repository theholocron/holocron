import type { RestClient } from "../utils.js";

export interface PostmanEnvironment {
	id: string;
	uid: string;
	name: string;
}

export interface PostmanEnvironmentsResponse {
	environments: PostmanEnvironment[];
}

export interface PostmanEnvironmentResponse {
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
