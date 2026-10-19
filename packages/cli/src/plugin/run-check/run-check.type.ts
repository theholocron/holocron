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
