import type { RestClient } from "../utils.js";

export interface ClerkInstance {
	id?: string;
	object?: string;
	environment_type?: "development" | "production" | "staging" | string;
}

export function instance(rest: RestClient) {
	return {
		get: (): Promise<ClerkInstance> =>
			rest.request<ClerkInstance>("/instance"),
	};
}
