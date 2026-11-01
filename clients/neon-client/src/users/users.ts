import type { RestClient } from "../utils.js";

/** The user the Neon API key belongs to; every field is optional because the API may omit it. */
export interface NeonMe {
	/** The user's id. */
	id?: string;
	/** The user's email address. */
	email?: string;
	/** The user's display name. */
	name?: string;
	/** The user's login. */
	login?: string;
}

export function users(rest: RestClient) {
	return {
		me: (): Promise<NeonMe> => rest.request<NeonMe>("/users/me"),
	};
}
