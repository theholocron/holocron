import type { SlackRestClient } from "../utils.js";

/** The response of Slack's `auth.test`, which checks a token. */
export interface SlackAuthTest {
	/** Always `true`: a response with `ok: false` is thrown as a `ProviderApiError` instead. */
	ok: true;
	/** The name of the workspace the token belongs to. */
	team: string;
	/** The name of the user the token belongs to. */
	user: string;
}

export function auth(rest: SlackRestClient) {
	return {
		/** Verify the token's identity (`POST auth.test`). */
		test: (): Promise<SlackAuthTest> => rest.call<SlackAuthTest>("auth.test", {}),
	};
}
