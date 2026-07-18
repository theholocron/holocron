import type { RestClient } from "../utils.js";

export interface PostmanCollection {
	id: string;
	uid: string;
	name: string;
}

export interface PostmanCollectionsResponse {
	collections: PostmanCollection[];
}

export function collections(rest: RestClient) {
	return {
		list: (workspaceId: string): Promise<PostmanCollectionsResponse> =>
			rest.request<PostmanCollectionsResponse>("/collections", {
				query: { workspace: workspaceId },
			}),

		delete: (uid: string): Promise<void> =>
			rest.request<void>(`/collections/${encodeURIComponent(uid)}`, {
				method: "DELETE",
			}),
	};
}
