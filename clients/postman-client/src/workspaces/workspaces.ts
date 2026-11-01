import type { RestClient } from "../utils.js";

/** A Postman workspace, as listed by the API. */
export interface PostmanWorkspace {
	/** The workspace's id. */
	id: string;
	/** The workspace's name. */
	name: string;
	/** The workspace's type. */
	type: string;
}

/** The response of listing workspaces. */
export interface PostmanWorkspacesResponse {
	/** The workspaces returned. */
	workspaces: PostmanWorkspace[];
}

export function workspaces(rest: RestClient) {
	return {
		list: (): Promise<PostmanWorkspacesResponse> => rest.request<PostmanWorkspacesResponse>("/workspaces"),
	};
}
