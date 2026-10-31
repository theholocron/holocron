import type { RestClient } from "../utils.js";

/** The identity of the token, from Doppler's `/me` endpoint. */
export interface DopplerMe {
	/** Token type: "cli" | "personal" | "service" | "service_account". */
	type?: string;
	/** Workplace-level identifier. */
	slug?: string;
	/** Present on account-level tokens. */
	workplace?: {
		/** The workplace name. */
		name?: string;
		/** The workplace slug. */
		slug?: string;
	};
	/** Present on user tokens. */
	name?: string;
}

export function me(rest: RestClient) {
	return {
		get: (): Promise<DopplerMe> => rest.request<DopplerMe>("/me"),
	};
}
