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
	/**
	 * Raw request body to send with the check — e.g. simulating a webhook
	 * delivery to verify signature checking is wired correctly end-to-end,
	 * as opposed to just the endpoint being reachable. Omitted entirely by
	 * default, leaving Checkly's own `bodyType` at `"NONE"`; `create()`/
	 * `update()` set it to `"RAW"` whenever a body is given.
	 */
	body?: string;
}

export interface ApiCheckInput {
	name: string;
	/** Minutes between runs. One of Checkly's fixed frequency values (0, 1, 2, 5, 10, 15, 30, 60, 120, 180, 360, 720, 1440). Defaults to 10. */
	frequency?: number;
	/** Checkly datacenter region ids (e.g. "us-east-1"). Defaults to the account's configured default. */
	locations?: string[];
	activated?: boolean;
	tags?: string[];
	/**
	 * Inverts pass/fail: when `true`, a response status >= 400 counts as
	 * passing (and a < 400 status fails) *before* assertions are even
	 * evaluated. Required for any check whose "healthy" response is
	 * itself an HTTP error status (e.g. asserting a 404/405 on an
	 * endpoint that should reject certain requests) — without it,
	 * Checkly's platform-level retry/failure classification treats any
	 * 4xx/5xx as a failure regardless of matching assertions. Defaults
	 * to `false`.
	 */
	shouldFail?: boolean;
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
	shouldFail: boolean;
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

/**
 * `ApiCheckInput.request.body` is holocron's simplified shape (just the raw
 * string); Checkly's wire format pairs it with a `bodyType` discriminator.
 * `"RAW"` whenever a body is given — the only body shape this client
 * exposes today — otherwise left unset, so Checkly's own `"NONE"` default
 * stands.
 */
function toWirePayload(input: ApiCheckInput): Record<string, unknown> {
	return {
		...input,
		request: {
			...input.request,
			...(input.request.body !== undefined ? { body: input.request.body, bodyType: "RAW" } : {}),
		},
	};
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
			rest.request<ApiCheck>("/checks/api", {
				method: "POST",
				body: toWirePayload(input),
			}),

		/** Update an existing API check. */
		update: (id: string, input: ApiCheckInput): Promise<ApiCheck> =>
			rest.request<ApiCheck>(`/checks/api/${id}`, {
				method: "PUT",
				body: toWirePayload(input),
			}),

		/** Delete a check (any type) by id. */
		delete: (id: string): Promise<void> => rest.request<void>(`/checks/${id}`, { method: "DELETE" }),
	};
}
