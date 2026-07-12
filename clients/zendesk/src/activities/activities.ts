// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import appConf from "@ce/app-config";
import { exreq, setBaseURL } from "@ce/utils-fetch";

import type { IAPIError } from "../types.js";
import type { IActivityResponse } from "./activities.types.js";

type TGetResponse = [IAPIError | null, IActivityResponse];

export interface FetchOptions {
	environment?: string;
	headers?: Record<string, unknown>;
	params?: Record<string, unknown>;
	token: string;
}

const operation = "/api/v2/activities";

const getActivities = (options: FetchOptions): Promise<TGetResponse> =>
	exreq({
		operation,
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
	get: getActivities,
};
