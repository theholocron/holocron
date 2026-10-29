import type { RestClient } from "@theholocron/http-client";

import type { ICommentResponse } from "./comments.types.js";

const PATH = "/api/v2/tickets";

export function comments(rest: RestClient) {
	return {
		list: (ticketId: number): Promise<ICommentResponse> =>
			rest.request<ICommentResponse>(`${PATH}/${ticketId}/comments`),

		create: (ticketId: number, body: string): Promise<void> =>
			rest.request<void>(`${PATH}/${ticketId}`, {
				method: "PUT",
				body: { ticket: { comment: { body } } },
			}),
	};
}
