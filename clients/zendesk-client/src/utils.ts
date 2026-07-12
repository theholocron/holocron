import { createRestClient, type RestClient } from "@theholocron/http-client";

export const createToken = (user: string, password: string): string =>
	Buffer.from(`${user}/token:${password}`).toString("base64");

export interface ZendeskClientOptions {
	/** Base URL of your Zendesk instance, e.g. "https://myorg.zendesk.com". */
	baseUrl: string;
	/** Token from createToken(email, apiToken). */
	token: string;
}

export function createZendeskRestClient(opts: ZendeskClientOptions): RestClient {
	return createRestClient({
		baseUrl: opts.baseUrl,
		token: opts.token,
		vendor: "Zendesk",
	});
}
