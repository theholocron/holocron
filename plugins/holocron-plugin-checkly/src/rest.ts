import { createRestClient, type RestClient } from "@theholocron/cli";

export type { RestClient };

/**
 * Narrowed to what `ChecklyMonitoring` actually needs: list/get/create/
 * update a check. Mirrors `@theholocron/checkly-client`'s own surface —
 * this plugin uses the inline `createRestClient` wrapper for now and
 * migrates to that typed client once it's published (holocron-skill-
 * plugin's documented two-phase pattern), not a reason to diverge on the
 * endpoint shapes in the meantime.
 */
export type ChecklyRestClient = RestClient;

export function createChecklyRestClient(opts: {
	token: string;
	/** Checkly account id — required on every request via `x-checkly-account`. */
	accountId: string;
	baseUrl?: string;
	fetch?: typeof fetch;
}): ChecklyRestClient {
	return createRestClient({
		baseUrl: opts.baseUrl ?? "https://api.checklyhq.com/v1",
		token: opts.token,
		vendor: "Checkly",
		extraHeaders: { "x-checkly-account": opts.accountId },
		fetch: opts.fetch,
	});
}
