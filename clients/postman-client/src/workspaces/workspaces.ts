import type { RestClient } from "../utils.js";

export interface PostmanWorkspace {
	id: string;
	name: string;
	type: string;
}

export interface PostmanWorkspacesResponse {
	workspaces: PostmanWorkspace[];
}

export function workspaces(rest: RestClient) {
	return {
		list: (): Promise<PostmanWorkspacesResponse> =>
			rest.request<PostmanWorkspacesResponse>("/workspaces"),
	};
}
