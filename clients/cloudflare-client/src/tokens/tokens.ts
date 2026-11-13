import { cfRequest, type RestClient } from "../utils.js";

/** The result of verifying the API token in use. */
export interface CfTokenVerification {
	/** The token's identifier. */
	id: string;
	/** Whether the token is active, disabled or expired. */
	status: "active" | "disabled" | "expired";
	/** When the token expires (ISO 8601), absent for a token that never does. */
	expires_on?: string;
	/** When the token becomes valid (ISO 8601), absent when it was not set. Not the creation time, but where it starts. */
	not_before?: string;
}

export function tokens(rest: RestClient) {
	return {
		verify: (): Promise<CfTokenVerification> => cfRequest<CfTokenVerification>(rest, "GET", "/user/tokens/verify"),
	};
}
