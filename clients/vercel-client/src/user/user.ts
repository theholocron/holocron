import type { RestClient } from "../utils.js";

/** The authenticated Vercel user. */
export interface VercelUser {
	/** The user id. */
	id?: string;
	/** The user's username. */
	username?: string;
	/** The user's email address. */
	email?: string;
	/** The user's display name. */
	name?: string;
}

/** The response of `user.get()`. */
export interface VercelUserResponse {
	/** The authenticated user. */
	user?: VercelUser;
}

export function user(rest: RestClient) {
	return {
		get: (): Promise<VercelUserResponse> => rest.request<VercelUserResponse>("/v2/user"),
	};
}
