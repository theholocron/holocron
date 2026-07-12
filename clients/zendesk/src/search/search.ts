// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import appConf from "@ce/app-config";
import { exreq, setBaseURL } from "@ce/utils-fetch";

import type { IAPIError } from "../types.js";
import type { ISearchResponse } from "./search.types.js";

type TGetResponse = [IAPIError | null, ISearchResponse];

export interface FetchOptions {
	environment?: string;
	headers?: Record<string, unknown>;
	params?: Record<string, unknown>;
	sort?: "asc" | "desc";
	token: string;
}

const operation = "/api/v2/search";

export default (query: string, options: FetchOptions): Promise<TGetResponse> =>
	exreq({
		operation,
		options: {
			...options,
			params: {
				...options.params,
				query,
				sort_order: options?.sort || "desc",
			},
			headers: {
				...options.headers,
				Authorization: `Basic ${options.token}`,
			},
			baseURL: setBaseURL("zendesk", appConf, options?.environment),
		},
	});
