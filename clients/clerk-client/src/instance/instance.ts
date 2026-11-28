import type { RestClient } from "../utils.js";

/** The Clerk instance the secret key belongs to. */
export interface ClerkInstance {
	/** The instance's identifier. */
	id?: string;
	/** The object type Clerk reports for the instance. */
	object?: string;
	/** Whether the instance is a development, production or staging one; other values pass through as a string. */
	environment_type?: "development" | "production" | "staging" | string;
}

export function instance(rest: RestClient) {
	return {
		get: (): Promise<ClerkInstance> => rest.request<ClerkInstance>("/instance"),
	};
}
