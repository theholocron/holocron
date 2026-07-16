import type { RestClient } from "../utils.js";

export interface GitHubUser {
	login: string;
	name: string | null;
	email: string | null;
}

export function user(rest: RestClient) {
	return {
		getCurrentUser: (): Promise<GitHubUser> =>
			rest.request<GitHubUser>("/user"),
	};
}
