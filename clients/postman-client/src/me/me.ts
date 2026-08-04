import type { RestClient } from "../utils.js";

export interface PostmanUser {
	id?: number | string;
	username?: string;
	email?: string;
	fullName?: string;
}

export interface PostmanMeResponse {
	user?: PostmanUser;
}

export function me(rest: RestClient) {
	return {
		get: (): Promise<PostmanMeResponse> => rest.request<PostmanMeResponse>("/me"),
	};
}
