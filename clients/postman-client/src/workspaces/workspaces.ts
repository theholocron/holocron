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

/** What `workspaces.create` takes. */
export interface PostmanCreateWorkspaceInput {
	/** The workspace's name. */
	name: string;
	/** The workspace's type: `personal` or `team`. */
	type: "personal" | "team";
	/** A description shown in Postman. */
	description?: string;
}

/** The response of creating one workspace. */
export interface PostmanWorkspaceResponse {
	/** The workspace made. */
	workspace: Pick<PostmanWorkspace, "id" | "name">;
}

export function workspaces(rest: RestClient) {
	return {
		list: (): Promise<PostmanWorkspacesResponse> => rest.request<PostmanWorkspacesResponse>("/workspaces"),

		create: (input: PostmanCreateWorkspaceInput): Promise<PostmanWorkspaceResponse> =>
			rest.request<PostmanWorkspaceResponse>("/workspaces", {
				method: "POST",
				body: { workspace: input },
			}),
	};
}
