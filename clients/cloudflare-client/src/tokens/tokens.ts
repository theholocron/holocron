import { cfRequest, type RestClient } from "../utils.js";

/** The result of verifying the API token in use. */
export interface CfTokenVerification {
	/** The token's identifier. */
	id: string;
	/** Whether the token is active, disabled or expired. */
	status: "active" | "disabled" | "expired";
}

export function tokens(rest: RestClient) {
	return {
		verify: (): Promise<CfTokenVerification> => cfRequest<CfTokenVerification>(rest, "GET", "/user/tokens/verify"),
	};
}
