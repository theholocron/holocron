import { createRestClient, type RestClient } from "@theholocron/http-client";

import { page } from "./page/index.js";

export { page };

export interface ConfluenceClientOptions {
	/** Base URL including the API path, e.g. "https://myorg.atlassian.net/wiki/rest/api". */
	baseUrl: string;
	/** Base64-encoded "email:apiToken" — use Buffer.from("email:token").toString("base64"). */
	token: string;
}

function createConfluenceRestClient(opts: ConfluenceClientOptions): RestClient {
	return createRestClient({
		baseUrl: opts.baseUrl,
		token: opts.token,
		vendor: "Confluence",
	});
}

export function createConfluenceClient(opts: ConfluenceClientOptions) {
	const rest = createConfluenceRestClient(opts);
	return {
		page: page(rest),
	};
}
