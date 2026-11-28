import type { RestClient } from "../utils.js";

/** The user the token belongs to. */
export interface NetlifyUser {
	/** The user's id. */
	id?: string;
	/** The user's full name. */
	full_name?: string;
	/** The user's email address. */
	email?: string;
}

export function user(rest: RestClient) {
	return {
		get: (): Promise<NetlifyUser> => rest.request<NetlifyUser>("/user"),
	};
}
