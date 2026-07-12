import type { RestClient } from "@theholocron/http-client";

import type { ICustomStatus, ICustomStatusResponse, ICustomStatusesResponse } from "./status.types.js";

const PATH = "/api/v2/custom_statuses";

export function status(rest: RestClient) {
	return {
		list: (): Promise<ICustomStatusesResponse> =>
			rest.request<ICustomStatusesResponse>(PATH),

		get: (id: number): Promise<ICustomStatusResponse> =>
			rest.request<ICustomStatusResponse>(`${PATH}/${id}`),

		create: (data: ICustomStatus): Promise<ICustomStatusResponse> =>
			rest.request<ICustomStatusResponse>(PATH, { method: "POST", body: { custom_status: data } }),

		update: (id: number, data: Partial<ICustomStatus>): Promise<ICustomStatusResponse> =>
			rest.request<ICustomStatusResponse>(`${PATH}/${id}`, { method: "PUT", body: { custom_status: data } }),
	};
}
