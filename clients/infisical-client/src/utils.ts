import { createRestClient, type RestClient } from "@theholocron/http-client";

export type { RestClient };

export interface InfisicalClientOptions {
	/** Infisical Universal Auth machine identity token or personal token. */
	token: string;
	/** Override base URL for testing. Defaults to https://app.infisical.com/api. */
	baseUrl?: string;
	/** Override fetch for testing. Defaults to globalThis.fetch. */
	fetch?: typeof fetch;
}

export function createInfisicalRestClient(
	opts: InfisicalClientOptions,
): RestClient {
	return createRestClient({
		baseUrl: opts.baseUrl ?? "https://app.infisical.com/api",
		token: opts.token,
		vendor: "Infisical",
		fetch: opts.fetch,
	});
}
