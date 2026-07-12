// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import appConf from "@ce/app-config";
import { exreq, setBaseURL, parseArgs } from "@ce/utils-fetch";

import type { IAPIError } from "../types.js";
import type { ITicketField, TTicketFieldsResponse, TTicketFieldResponse } from "./fields.types.js";

type TGetResponse = [IAPIError | null, TTicketFieldsResponse | TTicketFieldResponse];

export interface FetchOptions {
	environment?: string;
	headers?: Record<string, unknown>;
	id?: number | null;
	method?: "create" | "delete" | "patch" | "post" | "put";
	params?: Record<string, unknown>;
	token: string;
}

const operation = "/api/v2/ticket_fields";

const createField = (field: ITicketField, options: FetchOptions): Promise<ITicketField> =>
	exreq({
		operation,
		id: options?.id,
		method: options?.method || "post",
		data: {
			ticket_field: field,
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

const getFields = (...args: TGetParams): Promise<TGetResponse> => {
	const [ id, options ] = parseArgs(args);

	return exreq({
		operation,
		id,
		options: {
			...options,
			headers: {
				...options.headers,
				Authorization: `Basic ${options.token}`,
			},
			baseURL: setBaseURL("zendesk", appConf, options?.environment),
		},
	});
};

const updateField = (id: number, field: ITicketField, options: FetchOptions): Promise<ITicketField> =>
	createField(field, { method: "put", id, ...options });

const deleteField = (id: number, options: FetchOptions) =>
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
	create: createField,
	get: getFields,
	update: updateField,
	delete: deleteField,
};
