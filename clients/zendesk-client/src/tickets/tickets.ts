// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import appConf from "@ce/app-config";
import { exreq, setBaseURL, parseArgs } from "@ce/utils-fetch";

import type { IAPIError } from "../types.js";
import type { ITicket, TTicketResponse, TTicketsResponse } from "./tickets.types.js";

type TGetData = TTicketResponse | TTicketsResponse;
type TGetResponse = [IAPIError | null, TGetData];

export interface FetchOptions {
	environment?: string;
	headers?: Record<string, unknown>;
	id?: number | null;
	method?: "create" | "delete" | "patch" | "post" | "put";
	params?: Record<string, unknown>;
	token: string;
}

const operation = "/api/v2/tickets";

const createTicket = (ticket: ITicket, options: FetchOptions): Promise<ITicket> =>
	exreq({
		operation,
		id: options?.id,
		method: options?.method || "post",
		data: {
			ticket,
		},
		options: {
			...options,
			headers: {
				...options?.headers,
				Authorization: `Basic ${options.token}`,
			},
			baseURL: setBaseURL("zendesk", appConf, options?.environment),
		},
	});

type TGetParams = [id?: number | FetchOptions | undefined, options?: FetchOptions];

const getTickets = (...args: TGetParams): Promise<TGetResponse> => {
	const [ id, options ] = parseArgs(args);

	return exreq({
		operation,
		id,
		options: {
			...options,
			params: {
				include: "custom_statuses",
			},
			headers: {
				...options.headers,
				Authorization: `Basic ${options.token}`,
			},
			baseURL: setBaseURL("zendesk", appConf, options?.environment),
		},
	});
};

const updateTicket = (id: number, ticket: ITicket, options: FetchOptions): Promise<ITicket> =>
	createTicket(ticket, { method: "put", id, ...options });

const deleteTicket = (id: number, options: FetchOptions): Promise<void> =>
	exreq({
		operation,
		id,
		method: "delete",
		options: {
			...options,
			headers: {
				...options.headers,
				Authorization: `Basic ${options.token}`,
			},
			baseURL: setBaseURL("zendesk", appConf, options?.environment),
		},
	});

export default {
	create: createTicket,
	get: getTickets,
	update: updateTicket,
	delete: deleteTicket,
};
