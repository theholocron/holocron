import type { RestClient } from "../utils.js";

export interface DopplerMe {
	/** Token type: "cli" | "personal" | "service" | "service_account". */
	type?: string;
	/** Workplace-level identifier. */
	slug?: string;
	/** Present on account-level tokens. */
	workplace?: { name?: string; slug?: string };
	/** Present on user tokens. */
	name?: string;
}

export function me(rest: RestClient) {
	return {
		get: (): Promise<DopplerMe> => rest.request<DopplerMe>("/me"),
	};
}
