import type { RestClient } from "../utils.js";

export interface PostHogOrganization {
	id: string;
	slug: string;
	name: string;
}

export interface PostHogUser {
	email: string;
	organization: PostHogOrganization;
}

export function users(rest: RestClient) {
	return {
		/** Get the currently authenticated user. */
		me: (): Promise<PostHogUser> => rest.request<PostHogUser>("/api/users/@me/"),
	};
}
