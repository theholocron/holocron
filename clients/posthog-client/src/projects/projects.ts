import type { RestClient } from "../utils.js";

export interface PostHogProject {
	id: number;
	name: string;
	/** The client-side tracking token (`phc_*`). */
	api_token: string;
}

export interface PostHogProjectsResponse {
	results: PostHogProject[];
}

export interface CreatePostHogProjectInput {
	name: string;
}

export function projects(rest: RestClient) {
	return {
		/** List all projects accessible with the current token. */
		list: (): Promise<PostHogProjectsResponse> => rest.request<PostHogProjectsResponse>("/api/projects/"),

		/** Create a new project. Returns the created project including its tracking token. */
		create: (input: CreatePostHogProjectInput): Promise<PostHogProject> =>
			rest.request<PostHogProject>("/api/projects/", { method: "POST", body: input }),
	};
}
