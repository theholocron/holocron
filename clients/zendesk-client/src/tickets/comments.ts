// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import appConf from "@ce/app-config";
import { exreq, setBaseURL } from "@ce/utils-fetch";

import type { ICommentResponse } from "./comments.types.js";

const operation = "/api/v2/tickets";

export interface FetchOptions {
	environment?: string;
	headers?: Record<string, unknown>;
	params?: Record<string, unknown>;
	token: string;
}

const createComment = (id: number, comment: string, options: FetchOptions): Promise<ITicket> =>
	exreq({
		operation,
		id,
		method: options?.method || "post",
		data: {
			ticket: {
				comment: {
					body: comment,
				},
			},
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

const getComments = (ticket: number, options: FetchOptions): Promise<ICommentResponse> => {
	console.log({ ticket });
	return exreq({
		operation: `${operation}/${ticket}/comments`,
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

export default {
	create: createComment,
	get: getComments,
};
