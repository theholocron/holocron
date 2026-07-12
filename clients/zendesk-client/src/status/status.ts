// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import appConf from "@ce/app-config";
import { exreq, setBaseURL, parseArgs } from "@ce/utils-fetch";

import type { IAPIError } from "../types.js";
import type { ICustomStatusResponse, ICustomStatus } from "./status.types.js";

type TGetResponse = [IAPIError, ICustomStatusResponse];

export interface FetchOptions {
	environment?: string;
	headers?: Record<string, unknown>;
	id?: number | null;
	method?: "create" | "delete" | "patch" | "post" | "put";
	params?: Record<string, unknown>;
	token: string;
}

const operation = "/api/v2/custom_statuses";

const createStatus = (status: ICustomStatus, options: FetchOptions): Promise<void> =>
	exreq({
		operation,
		id: options?.id,
		method: options?.method || "post",
		data: {
			custom_status: status,
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

const getStatus = (...args: TGetParams): Promise<TGetResponse> => {
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
}

const updateStatus = (id: number, status: ICustomStatus, options: FetchOptions) =>
	createStatus(status, { method: 'put', id, ...options });

export default {
	create: createStatus,
	get: getStatus,
	update: updateStatus,
};
