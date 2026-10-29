import { cfRequest, type RestClient } from "../utils.js";

export interface CfTokenVerification {
	id: string;
	status: "active" | "disabled" | "expired";
}

export function tokens(rest: RestClient) {
	return {
		verify: (): Promise<CfTokenVerification> => cfRequest<CfTokenVerification>(rest, "GET", "/user/tokens/verify"),
	};
}
