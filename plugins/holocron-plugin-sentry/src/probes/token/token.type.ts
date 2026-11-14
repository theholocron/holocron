import type { SentryClient } from "../../rest.js";

/** What the `token` probe reads from the plugin: the organization, and the token and a client built with it. */
export interface TokenProbeContext {
	/** The `org` option of the `sentry` provider; the projects and alert rules are read in it. */
	org: string | undefined;
	/** The client the token is used through: the plugin's token, or the one `--environment` or `--token` handed it. */
	client: () => SentryClient;
	/** The resolved token, marked secret so it is never printed. Throws an `AuthError` when none is set. */
	token: () => string;
}
