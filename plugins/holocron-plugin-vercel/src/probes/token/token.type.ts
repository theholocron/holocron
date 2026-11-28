import type { VerifyTokenResult } from "@theholocron/cli";

import type { VercelClient } from "../../rest.js";

/** What the `token` probe reads from the plugin: a client built with the token, and the token itself. */
export interface TokenProbeContext {
	/** The client the token is used through. */
	client: () => VercelClient;
	/** The plugin's `verifyToken` with its options bound: who the token belongs to. */
	verify: (token: string) => Promise<VerifyTokenResult>;
	/** The resolved token, marked secret so it is never printed. Throws an `AuthError` when none is set. */
	token: () => string;
}
