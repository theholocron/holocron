import type { RestClient } from "../utils.js";
import type { PostmanCollection } from "../collections/collections.js";

export interface PostmanImportOpenApiResponse {
	collections: PostmanCollection[];
}

export function importApi(rest: RestClient) {
	return {
		openapi: (
			workspaceId: string,
			spec: unknown,
		): Promise<PostmanImportOpenApiResponse> =>
			rest.request<PostmanImportOpenApiResponse>("/import/openapi", {
				method: "POST",
				query: { workspace: workspaceId },
				body: {
					type: "string",
					input:
						typeof spec === "string" ? spec : JSON.stringify(spec),
				},
			}),
	};
}
