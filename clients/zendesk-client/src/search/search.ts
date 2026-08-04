import type { RestClient } from "@theholocron/http-client";

import type { ISearchResponse } from "./search.types.js";

const PATH = "/api/v2/search";

export function search(rest: RestClient) {
	return {
		query: (q: string, params?: Record<string, string>): Promise<ISearchResponse> =>
			rest.request<ISearchResponse>(PATH, {
				query: { query: q, sort_order: "desc", ...params },
			}),
	};
}
