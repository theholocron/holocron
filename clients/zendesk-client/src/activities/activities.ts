import type { RestClient } from "@theholocron/http-client";

import type { IActivityResponse } from "./activities.types.js";

const PATH = "/api/v2/activities";

/** Builds the activities resource of the Zendesk API (`/api/v2/activities`) on top of a REST client. */
export function activities(rest: RestClient) {
	return {
		get: (params?: Record<string, string>): Promise<IActivityResponse> =>
			rest.request<IActivityResponse>(PATH, { query: params }),
	};
}
