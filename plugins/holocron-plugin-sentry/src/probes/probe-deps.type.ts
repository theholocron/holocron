import type { SentryClient } from "../rest.js";

/** What a Sentry probe needs from the plugin: the org, and the client made with the relay's token. */
export interface SentryProbeDeps {
	org: string | undefined;
	client: () => SentryClient;
	env?: Record<string, string | undefined>;
	fetch?: typeof fetch;
}

export function requireOrg(deps: SentryProbeDeps): string {
	if (!deps.org) throw new Error("the Sentry probes need `org` in the sentry provider's options");
	return deps.org;
}
