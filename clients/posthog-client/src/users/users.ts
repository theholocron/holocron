import type { RestClient } from "../utils.js";

/** The PostHog organization a user belongs to. */
export interface PostHogOrganization {
	/** The organization id. */
	id: string;
	/** The organization slug. */
	slug: string;
	/** The organization name. */
	name: string;
}

/** The user the PostHog token belongs to. */
export interface PostHogUser {
	/** The user's email address. */
	email: string;
	/** The organization the user is currently in. */
	organization: PostHogOrganization;
}

export function users(rest: RestClient) {
	return {
		/** Get the currently authenticated user. */
		me: (): Promise<PostHogUser> => rest.request<PostHogUser>("/api/users/@me/"),
	};
}
