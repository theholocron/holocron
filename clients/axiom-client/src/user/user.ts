import type { RestClient } from "../utils.js";

export interface AxiomUser {
	id: string;
	name?: string;
	email?: string;
	emails?: string[];
}

export function user(rest: RestClient) {
	return {
		/** Get the currently authenticated token's user. */
		me: (): Promise<AxiomUser> => rest.request<AxiomUser>("/v2/user"),
	};
}
