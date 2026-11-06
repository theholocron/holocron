/** What part of a response a {@link CheckAssertion} looks at. */
export type CheckAssertionSource = "status_code" | "response_time" | "body" | "header";

/** How a {@link CheckAssertion} compares the part of the response with its target. */
export type CheckAssertionComparison =
	"equals" | "not_equals" | "contains" | "not_contains" | "greater_than" | "less_than";

/** A condition a check's response must meet to pass. */
export interface CheckAssertion {
	/** The part of the response to look at. */
	source: CheckAssertionSource;
	/** How to compare it with `target`. */
	comparison: CheckAssertionComparison;
	/** The header name, required when `source` is `"header"`. */
	property?: string;
	/** The value to compare against. */
	target?: string;
}

/** An HTTP check: the request to make and the conditions its response must meet. Structurally a monitoring check's definition. */
export interface CheckInput {
	/** The URL to request. */
	url: string;
	/** The HTTP method. Defaults to `GET`. A body is only sent for a method other than `GET` and `HEAD`. */
	method?: string;
	/** The request body. */
	body?: string;
	/** Conditions the response must meet; with none, only the status (below 400) is checked. */
	assertions?: CheckAssertion[];
	/** Inverts the implicit status check: set it when the healthy response is itself an error status (a 404, say). */
	shouldFail?: boolean;
}

export interface CheckRunResult {
	passed: boolean;
	status?: number;
	responseTimeMs?: number;
	/** Human-readable reasons, one per failed assertion (plus the implicit >=400 check, when it fires). Empty when `passed`. */
	failures: string[];
	/** Set only when the request itself failed (network error, timeout, etc.) — never passes, regardless of `shouldFail`. */
	requestError?: string;
}

export interface RunCheckOptions {
	/**
	 * Overrides the origin of `input.url` — e.g. a PR's preview deployment
	 * origin instead of the check's own configured production one. Only
	 * the scheme+host+port are taken from this; `input.url`'s own
	 * path/query are preserved (a bare preview origin would otherwise
	 * silently drop e.g. `/api/webhook` and test `/` instead).
	 */
	url?: string;
	/** Injectable for testing. Defaults to the global `fetch`. */
	fetch?: typeof fetch;
	/** Request timeout in ms, covering the whole request including body read. Default 10s. */
	timeoutMs?: number;
	/** Max response body bytes read when an assertion needs the body. Default 1MB. */
	maxBodyBytes?: number;
	/** Extra headers merged into the request — e.g. a Deployment Protection bypass header. */
	headers?: Record<string, string>;
}
