import type { RestClient } from "../utils.js";

export interface InfisicalWorkspace {
	_id?: string;
	id?: string;
	name?: string;
	slug?: string;
}

export interface InfisicalWorkspaceEnvironment {
	id?: string;
	name?: string;
	slug?: string;
}

export interface InfisicalWorkspaceDetails {
	environments?: InfisicalWorkspaceEnvironment[];
}

export interface InfisicalWorkspaceListResponse {
	workspaces?: InfisicalWorkspace[];
}

export interface InfisicalWorkspaceDetailsResponse {
	workspace?: InfisicalWorkspaceDetails;
}

export function workspaces(rest: RestClient) {
	return {
		list: (): Promise<InfisicalWorkspaceListResponse> =>
			rest.request<InfisicalWorkspaceListResponse>("/v1/workspace"),

		get: (
			workspaceId: string,
		): Promise<InfisicalWorkspaceDetailsResponse> =>
			rest.request<InfisicalWorkspaceDetailsResponse>(
				`/v1/workspace/${encodeURIComponent(workspaceId)}`,
			),

		create: (name: string, slug: string): Promise<unknown> =>
			rest.request<unknown>("/v2/workspace", {
				method: "POST",
				body: { projectName: name, slug },
			}),

		createEnvironment: (
			workspaceId: string,
			name: string,
			slug: string,
		): Promise<unknown> =>
			rest.request<unknown>(
				`/v1/workspace/${encodeURIComponent(workspaceId)}/environments`,
				{
					method: "POST",
					body: { environmentName: name, environmentSlug: slug },
				},
			),
	};
}
