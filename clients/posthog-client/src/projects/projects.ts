import type { RestClient } from "../utils.js";

/** A PostHog project. */
export interface PostHogProject {
	/** The project id. */
	id: number;
	/** The project name. */
	name: string;
	/** The client-side tracking token (`phc_*`). */
	api_token: string;
}

/** The response of listing projects. */
export interface PostHogProjectsResponse {
	/** The projects the token can access. */
	results: PostHogProject[];
}

/** What to create a project with. */
export interface CreatePostHogProjectInput {
	/** The name of the new project. */
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
