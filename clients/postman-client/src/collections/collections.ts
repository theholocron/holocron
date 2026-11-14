import type { RestClient } from "../utils.js";

/** A Postman collection, as listed by the API. */
export interface PostmanCollection {
	/** The collection's id. */
	id: string;
	/** The collection's unique id, prefixed with its owner's id. */
	uid: string;
	/** The collection's name. */
	name: string;
}

/** The response of listing collections. */
export interface PostmanCollectionsResponse {
	/** The collections returned. */
	collections: PostmanCollection[];
}

/** The response of fetching, creating or updating one collection. */
export interface PostmanCollectionResponse {
	/** The collection. */
	collection: PostmanCollection;
}

export function collections(rest: RestClient) {
	return {
		list: (workspaceId: string): Promise<PostmanCollectionsResponse> =>
			rest.request<PostmanCollectionsResponse>("/collections", {
				query: { workspace: workspaceId },
			}),

		create: (workspaceId: string, collection: unknown): Promise<PostmanCollectionResponse> =>
			rest.request<PostmanCollectionResponse>("/collections", {
				method: "POST",
				query: { workspace: workspaceId },
				body: { collection },
			}),

		update: (uid: string, collection: unknown): Promise<PostmanCollectionResponse> =>
			rest.request<PostmanCollectionResponse>(`/collections/${encodeURIComponent(uid)}`, {
				method: "PUT",
				body: { collection },
			}),

		delete: (uid: string): Promise<void> =>
			rest.request<void>(`/collections/${encodeURIComponent(uid)}`, {
				method: "DELETE",
			}),
	};
}
