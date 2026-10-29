import { projects } from "./projects/projects.js";
import { users } from "./users/users.js";
import { createPostHogRestClient, type PostHogClientOptions } from "./utils.js";

export type { CreatePostHogProjectInput, PostHogProject, PostHogProjectsResponse } from "./projects/projects.js";
export type { PostHogOrganization, PostHogUser } from "./users/users.js";
export type { PostHogClientOptions } from "./utils.js";

export function createPostHogClient(opts: PostHogClientOptions) {
	const rest = createPostHogRestClient(opts);
	return {
		users: users(rest),
		projects: projects(rest),
	};
}

export type PostHogClient = ReturnType<typeof createPostHogClient>;
