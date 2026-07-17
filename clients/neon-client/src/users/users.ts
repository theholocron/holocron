import type { RestClient } from "../utils.js";

export interface NeonMe {
	id?: string;
	email?: string;
	name?: string;
	login?: string;
}

export function users(rest: RestClient) {
	return {
		me: (): Promise<NeonMe> => rest.request<NeonMe>("/users/me"),
	};
}
