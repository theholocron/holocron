import type { RestClient } from "../utils.js";

/** A Postman API specification, as listed by the API. */
export interface PostmanSpec {
	/** The specification's id. */
	id: string;
	/** The specification's name. */
	name: string;
	/** The specification's type. */
	type: string;
}

/** The response of listing specifications. */
export interface PostmanSpecsResponse {
	/** The specifications returned. */
	specs: PostmanSpec[];
}

/** What to send to Postman to create a specification. */
export interface PostmanCreateSpecInput {
	/** The specification's name. */
	name: string;
	/** The specification's content, as a string. */
	fileContent: string;
	/** The specification's type, when set. */
	type?: string;
	/** The path of the specification's file, when set. */
	filePath?: string;
}

export function specs(rest: RestClient) {
	return {
		list: (workspaceId: string): Promise<PostmanSpecsResponse> =>
			rest.request<PostmanSpecsResponse>("/specs", {
				query: { workspaceId },
			}),

		create: (workspaceId: string, input: PostmanCreateSpecInput): Promise<PostmanSpec> =>
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

		updateFile: (specId: string, filePath: string, content: string): Promise<void> =>
			rest.request<void>(`/specs/${encodeURIComponent(specId)}/files/${encodeURIComponent(filePath)}`, {
				method: "PATCH",
				body: { content },
			}),
	};
}
