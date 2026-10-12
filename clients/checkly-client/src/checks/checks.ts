import type { RestClient } from "../utils.js";

export type AssertionSource = "STATUS_CODE" | "JSON_BODY" | "HEADERS" | "TEXT_BODY" | "RESPONSE_TIME";

export type AssertionComparison =
	| "EQUALS"
	| "NOT_EQUALS"
	| "HAS_KEY"
	| "NOT_HAS_KEY"
	| "HAS_VALUE"
	| "NOT_HAS_VALUE"
	| "IS_EMPTY"
	| "NOT_EMPTY"
	| "GREATER_THAN"
	| "LESS_THAN"
	| "CONTAINS"
	| "NOT_CONTAINS"
	| "IS_NULL"
	| "NOT_NULL";

export interface Assertion {
	source: AssertionSource;
	comparison: AssertionComparison;
	/** JSON path / header name the assertion reads — required for JSON_BODY and HEADERS. */
	property?: string;
	target?: string;
	regex?: string;
}

export type HttpMethod = "GET" | "POST" | "PUT" | "HEAD" | "DELETE" | "PATCH";

export interface ApiCheckRequest {
	url: string;
	method: HttpMethod;
	assertions?: Assertion[];
}

export interface ApiCheckInput {
	name: string;
	/** Minutes between runs. One of Checkly's fixed frequency values (0, 1, 2, 5, 10, 15, 30, 60, 120, 180, 360, 720, 1440). Defaults to 10. */
	frequency?: number;
	/** Checkly datacenter region ids (e.g. "us-east-1"). Defaults to the account's configured default. */
	locations?: string[];
	activated?: boolean;
	tags?: string[];
	request: ApiCheckRequest;
}

export interface ApiCheck {
	id: string;
	name: string;
	checkType: "API";
	activated: boolean;
	frequency: number;
	locations: string[] | null;
	tags: string[];
	request: ApiCheckRequest;
	created_at: string;
	updated_at: string | null;
}

export interface ListChecksParams {
	/** Case-insensitive partial match on the check name. */
	search?: string;
	limit?: number;
	page?: number;
}

export function checks(rest: RestClient) {
	return {
		/** List checks, optionally filtered by a case-insensitive partial name match. */
		list: (params: ListChecksParams = {}): Promise<ApiCheck[]> =>
			rest.request<ApiCheck[]>("/checks", {
				query: {
					...(params.search ? { search: params.search } : {}),
					...(params.limit !== undefined ? { limit: String(params.limit) } : {}),
					...(params.page !== undefined ? { page: String(params.page) } : {}),
				},
			}),

		/** Get a single check by id. Throws ProviderApiError 404 if not found. */
		get: (id: string): Promise<ApiCheck> => rest.request<ApiCheck>(`/checks/${id}`),

		/** Create a new API check. */
		create: (input: ApiCheckInput): Promise<ApiCheck> =>
			rest.request<ApiCheck>("/checks/api", { method: "POST", body: input }),

		/** Update an existing API check. */
		update: (id: string, input: ApiCheckInput): Promise<ApiCheck> =>
			rest.request<ApiCheck>(`/checks/api/${id}`, { method: "PUT", body: input }),

		/** Delete a check (any type) by id. */
		delete: (id: string): Promise<void> => rest.request<void>(`/checks/${id}`, { method: "DELETE" }),
	};
}
