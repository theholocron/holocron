import type { RestClient } from "@theholocron/http-client";

import type { ITicket, TTicketResponse, TTicketsResponse } from "./tickets.types.js";

const PATH = "/api/v2/tickets";

export function tickets(rest: RestClient) {
	return {
		list: (params?: Record<string, string>): Promise<TTicketsResponse> =>
			rest.request<TTicketsResponse>(PATH, {
				query: { include: "custom_statuses", ...params },
			}),

		get: (id: number): Promise<TTicketResponse> =>
			rest.request<TTicketResponse>(`${PATH}/${id}`),

		create: (data: ITicket): Promise<TTicketResponse> =>
			rest.request<TTicketResponse>(PATH, { method: "POST", body: { ticket: data } }),

		update: (id: number, data: Partial<ITicket>): Promise<TTicketResponse> =>
			rest.request<TTicketResponse>(`${PATH}/${id}`, { method: "PUT", body: { ticket: data } }),

		delete: (id: number): Promise<void> =>
			rest.request<void>(`${PATH}/${id}`, { method: "DELETE", expectNoContent: true }),
	};
}
