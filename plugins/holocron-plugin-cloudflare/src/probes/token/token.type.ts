import type { CloudflareClient } from "../../rest.js";

/** What the `token` probe reads from the plugin: the account, the token and a client built with it. */
export interface TokenProbeContext {
	/** The plugin's options; only the account id is read, for the account-level checks. */
	options: { accountId?: string };
	/** The client the token is used through. */
	client: () => CloudflareClient;
	/** The resolved API token, marked secret so it is never printed. Throws an `AuthError` when none is set. */
	token: () => string;
	/** The current time, for the rotation rows. Default: now. Tests set it. */
	now?: () => Date;
}
