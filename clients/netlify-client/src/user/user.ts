import type { RestClient } from "../utils.js";

export interface NetlifyUser {
	id?: string;
	full_name?: string;
	email?: string;
}

export function user(rest: RestClient) {
	return {
		get: (): Promise<NetlifyUser> => rest.request<NetlifyUser>("/user"),
	};
}
