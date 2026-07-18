import type { RestClient } from "../utils.js";

export interface VercelUser {
	id?: string;
	username?: string;
	email?: string;
	name?: string;
}

export interface VercelUserResponse {
	user?: VercelUser;
}

export function user(rest: RestClient) {
	return {
		get: (): Promise<VercelUserResponse> =>
			rest.request<VercelUserResponse>("/v2/user"),
	};
}
