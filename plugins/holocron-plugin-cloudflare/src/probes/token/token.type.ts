import type { CloudflareClient } from "../../rest.js";

/** What the `token` probe reads from the plugin: the account, the token and a client built with it. */
export interface TokenProbeContext {
	/** The plugin's options: the account id, for the account-level checks, and the org's zone, for the zone checks. */
	options: { accountId?: string; zone?: string };
	/** The client the token is used through. */
	client: () => CloudflareClient;
	/** The resolved API token, marked secret so it is never printed. Throws an `AuthError` when none is set. */
	token: () => string;
	/** The current time, for the rotation rows. Default: now. Tests set it. */
	now?: () => Date;
}
