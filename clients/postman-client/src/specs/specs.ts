import type { RestClient } from "../utils.js";

export interface PostmanSpec {
	id: string;
	name: string;
	type: string;
}

export interface PostmanSpecsResponse {
	specs: PostmanSpec[];
}

export interface PostmanCreateSpecInput {
	name: string;
	fileContent: string;
	type?: string;
	filePath?: string;
}

export function specs(rest: RestClient) {
	return {
		list: (workspaceId: string): Promise<PostmanSpecsResponse> =>
			rest.request<PostmanSpecsResponse>("/specs", {
				query: { workspaceId },
			}),

		create: (
			workspaceId: string,
			input: PostmanCreateSpecInput,
		): Promise<PostmanSpec> =>
			rest.request<PostmanSpec>("/specs", {
				method: "POST",
				query: { workspaceId },
				body: {
					name: input.name,
					type: input.type ?? "OPENAPI:3.0",
					files: [
						{
							path: input.filePath ?? "index.json",
							content: input.fileContent,
						},
					],
				},
			}),

		updateFile: (
			specId: string,
			filePath: string,
			content: string,
		): Promise<void> =>
			rest.request<void>(
				`/specs/${encodeURIComponent(specId)}/files/${encodeURIComponent(filePath)}`,
				{ method: "PATCH", body: { content } },
			),
	};
}
