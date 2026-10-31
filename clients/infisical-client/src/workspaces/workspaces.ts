import type { RestClient } from "../utils.js";

/** An Infisical workspace (project); the API may return its id as `_id`, `id` or both. */
export interface InfisicalWorkspace {
	/** The workspace id in the API's legacy `_id` form. */
	_id?: string;
	/** The workspace id. */
	id?: string;
	/** The workspace name. */
	name?: string;
	/** The workspace slug. */
	slug?: string;
}

/** An environment of a workspace. */
export interface InfisicalWorkspaceEnvironment {
	/** The environment id. */
	id?: string;
	/** The environment name. */
	name?: string;
	/** The environment slug, such as `dev`. */
	slug?: string;
}

/** A workspace with the details the client reads. */
export interface InfisicalWorkspaceDetails {
	/** The workspace's environments. */
	environments?: InfisicalWorkspaceEnvironment[];
}

/** The response of listing workspaces. */
export interface InfisicalWorkspaceListResponse {
	/** The workspaces the token can see. */
	workspaces?: InfisicalWorkspace[];
}

/** The response of reading one workspace. */
export interface InfisicalWorkspaceDetailsResponse {
	/** The workspace that was read. */
	workspace?: InfisicalWorkspaceDetails;
}

export function workspaces(rest: RestClient) {
	return {
		list: (): Promise<InfisicalWorkspaceListResponse> =>
			rest.request<InfisicalWorkspaceListResponse>("/v1/workspace"),

		get: (workspaceId: string): Promise<InfisicalWorkspaceDetailsResponse> =>
			rest.request<InfisicalWorkspaceDetailsResponse>(`/v1/workspace/${encodeURIComponent(workspaceId)}`),

		create: (name: string, slug: string): Promise<unknown> =>
			rest.request<unknown>("/v2/workspace", {
				method: "POST",
				body: { projectName: name, slug },
			}),

		createEnvironment: (workspaceId: string, name: string, slug: string): Promise<unknown> =>
			rest.request<unknown>(`/v1/workspace/${encodeURIComponent(workspaceId)}/environments`, {
				method: "POST",
				body: { environmentName: name, environmentSlug: slug },
			}),
	};
}
