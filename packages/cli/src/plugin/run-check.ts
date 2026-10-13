/**
 * Runs a `MonitoringCheckInput` directly over HTTP, with no vendor API
 * call at all — the local counterpart to a provider's `ensureCheck()`.
 *
 * Exists for `holocron monitoring check <url>` (holocron#1010): testing
 * a PR's Vercel preview deployment against the exact same check
 * definitions already configured for production in `holocron.config.ts`,
 * without creating a persistent resource on the vendor's platform for an
 * ephemeral, per-PR run.
 *
 * No comparison logic exists anywhere else in this codebase to reuse —
 * Checkly's own API evaluates `assertions` server-side, so this is a
 * fresh implementation of the same vendor-neutral vocabulary
 * (`MonitoringAssertionSource`/`MonitoringAssertionComparison`) `src/
 * plugin/capabilities.ts` already defines. The `shouldFail` semantics
 * mirror Checkly's documented platform behavior (ADR-0013): a response
 * status >= 400 is an automatic failure unless the check's own healthy
 * response is itself an error status.
 */

import type { MonitoringAssertion, MonitoringAssertionComparison, MonitoringCheckInput } from "./capabilities.js";

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
	/** Overrides `input.url` — e.g. a PR's preview deployment URL instead of the check's own configured production one. */
	url?: string;
	/** Injectable for testing. Defaults to the global `fetch`. */
	fetch?: typeof fetch;
}

export async function runCheckAgainstUrl(
	input: MonitoringCheckInput,
	opts: RunCheckOptions = {}
): Promise<CheckRunResult> {
	const doFetch = opts.fetch ?? fetch;
	const url = opts.url ?? input.url;
	const start = Date.now();

	let response: Response;
	let bodyText: string;
	try {
		response = await doFetch(url, {
			method: input.method ?? "GET",
			...(input.body !== undefined ? { body: input.body } : {}),
		});
		bodyText = await response.text();
	} catch (err) {
		return { passed: false, failures: [], requestError: err instanceof Error ? err.message : String(err) };
	}
	const responseTimeMs = Date.now() - start;

	const failures: string[] = [];

	// Mirrors Checkly's own platform-level classification (ADR-0013): a
	// >=400 response is a failure before any assertion runs, unless the
	// check's own healthy response IS an error status.
	if (!input.shouldFail && response.status >= 400) {
		failures.push(`HTTP ${response.status} (>= 400 counts as a failure unless \`shouldFail\` is set)`);
	}

	for (const assertion of input.assertions ?? []) {
		const actual = extractActual(assertion, { response, bodyText, responseTimeMs });
		if (!evaluate(assertion.comparison, actual, assertion.target)) {
			failures.push(
				`${assertion.source} ${assertion.comparison} "${assertion.target ?? ""}" — got "${truncate(actual)}"`
			);
		}
	}

	return { passed: failures.length === 0, status: response.status, responseTimeMs, failures };
}

/** Keeps a failure message readable when `actual` is a full HTML/JSON response body. */
function truncate(value: string, max = 200): string {
	return value.length > max ? `${value.slice(0, max)}…` : value;
}

function extractActual(
	assertion: MonitoringAssertion,
	ctx: { response: Response; bodyText: string; responseTimeMs: number }
): string {
	switch (assertion.source) {
		case "status_code":
			return String(ctx.response.status);
		case "response_time":
			return String(ctx.responseTimeMs);
		case "body":
			return ctx.bodyText;
		case "header": {
			// Headers.get("") throws (empty string is an invalid header
			// name per the Fetch spec) — short-circuit before calling it.
			const name = assertion.property ?? "";
			return name ? (ctx.response.headers.get(name) ?? "") : "";
		}
	}
}

function evaluate(comparison: MonitoringAssertionComparison, actual: string, target: string | undefined): boolean {
	const t = target ?? "";
	switch (comparison) {
		case "equals":
			return actual === t;
		case "not_equals":
			return actual !== t;
		case "contains":
			return actual.includes(t);
		case "not_contains":
			return !actual.includes(t);
		case "greater_than":
			return Number(actual) > Number(t);
		case "less_than":
			return Number(actual) < Number(t);
	}
}
