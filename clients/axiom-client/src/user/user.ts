import type { RestClient } from "../utils.js";

/** The user the Axiom token belongs to. */
export interface AxiomUser {
	/** The user id. */
	id: string;
	/** The user's name. */
	name?: string;
	/** The user's primary email address. */
	email?: string;
	/** All of the user's email addresses. */
	emails?: string[];
}

export function user(rest: RestClient) {
	return {
		/** Get the currently authenticated token's user. */
		me: (): Promise<AxiomUser> => rest.request<AxiomUser>("/v2/user"),
	};
}
