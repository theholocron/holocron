import type { RestClient } from "@theholocron/http-client";

import type { ICustomStatus, ICustomStatusesResponse, ICustomStatusResponse } from "./status.types.js";

const PATH = "/api/v2/custom_statuses";

/** Builds the custom ticket statuses resource of the Zendesk API (`/api/v2/custom_statuses`) on top of a REST client. */
export function status(rest: RestClient) {
	return {
		list: (): Promise<ICustomStatusesResponse> => rest.request<ICustomStatusesResponse>(PATH),

		get: (id: number): Promise<ICustomStatusResponse> => rest.request<ICustomStatusResponse>(`${PATH}/${id}`),

		create: (data: ICustomStatus): Promise<ICustomStatusResponse> =>
			rest.request<ICustomStatusResponse>(PATH, {
				method: "POST",
				body: { custom_status: data },
			}),

		update: (id: number, data: Partial<ICustomStatus>): Promise<ICustomStatusResponse> =>
			rest.request<ICustomStatusResponse>(`${PATH}/${id}`, {
				method: "PUT",
				body: { custom_status: data },
			}),
	};
}
