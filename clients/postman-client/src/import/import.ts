import type { PostmanCollection } from "../collections/collections.js";
import type { RestClient } from "../utils.js";

/** The response of importing an OpenAPI definition. */
export interface PostmanImportOpenApiResponse {
	/** The collections the import created. */
	collections: PostmanCollection[];
}

export function importApi(rest: RestClient) {
	return {
		openapi: (workspaceId: string, spec: unknown): Promise<PostmanImportOpenApiResponse> =>
			rest.request<PostmanImportOpenApiResponse>("/import/openapi", {
				method: "POST",
				query: { workspace: workspaceId },
				body: {
					type: "string",
					input: typeof spec === "string" ? spec : JSON.stringify(spec),
				},
			}),
	};
}
