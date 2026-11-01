import type { RestClient } from "../utils.js";

/** The user the API key belongs to. */
export interface PostmanUser {
	/** The user's id. */
	id?: number | string;
	/** The user's username. */
	username?: string;
	/** The user's email address. */
	email?: string;
	/** The user's full name. */
	fullName?: string;
}

/** The response of fetching the current user. */
export interface PostmanMeResponse {
	/** The user. */
	user?: PostmanUser;
}

export function me(rest: RestClient) {
	return {
		get: (): Promise<PostmanMeResponse> => rest.request<PostmanMeResponse>("/me"),
	};
}
