import type { RestClient } from "@theholocron/http-client";

import type { ITicketField, TTicketFieldResponse, TTicketFieldsResponse } from "./fields.types.js";

const PATH = "/api/v2/ticket_fields";

export function fields(rest: RestClient) {
	return {
		list: (): Promise<TTicketFieldsResponse> =>
			rest.request<TTicketFieldsResponse>(PATH),

		get: (id: number): Promise<TTicketFieldResponse> =>
			rest.request<TTicketFieldResponse>(`${PATH}/${id}`),

		create: (data: ITicketField): Promise<TTicketFieldResponse> =>
			rest.request<TTicketFieldResponse>(PATH, { method: "POST", body: { ticket_field: data } }),

		update: (id: number, data: Partial<ITicketField>): Promise<TTicketFieldResponse> =>
			rest.request<TTicketFieldResponse>(`${PATH}/${id}`, { method: "PUT", body: { ticket_field: data } }),

		delete: (id: number): Promise<void> =>
			rest.request<void>(`${PATH}/${id}`, { method: "DELETE", expectNoContent: true }),
	};
}
