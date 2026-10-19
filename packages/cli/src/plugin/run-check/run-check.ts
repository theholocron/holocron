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
 *
 * Hardening, all driven by this running against a URL the triggering
 * event controls (a PR's preview deployment), not a trusted static
 * config value (sourcery review on holocron#1011):
 *   - `redirect: "manual"` — a check never follows a redirect to
 *     whatever host the response names. The 3xx itself is what gets
 *     evaluated; that's also more correct for a monitoring check
 *     anyway (silently following would hide a real regression).
 *   - A request deadline (`AbortSignal.timeout`) — a preview that
 *     accepts the request but never finishes can't hang the check (or
 *     the ones after it) past the timeout.
 *   - The body is only read when an assertion actually needs it, and
 *     even then capped at `maxBodyBytes` — an attacker-reachable
 *     endpoint can't use an unbounded response to exhaust the runner.
 *
 * `opts.headers` (holocron#1030): merged into every request — the one
 * caller that needs it, `delivery.previewCheck`, uses it to send
 * Vercel's `x-vercel-protection-bypass` header so Deployment
 * Protection (on by default for Preview deployments) doesn't redirect
 * the check to Vercel's own SSO login before it ever reaches the
 * app. Vendor-neutral by design — this module has no Vercel-specific
 * knowledge; the header name and value are the CLI command's concern
 * (`cli.ts`), not this evaluator's.
 */

import type {
	MonitoringAssertion,
	MonitoringAssertionComparison,
	MonitoringCheckInput,
} from "../capabilities/index.js";
import type { CheckRunResult, RunCheckOptions } from "./run-check.type.js";

export async function runCheckAgainstUrl(
	input: MonitoringCheckInput,
	opts: RunCheckOptions = {}
): Promise<CheckRunResult> {
	const doFetch = opts.fetch ?? fetch;
	const url = resolveUrl(input.url, opts.url);
	const method = input.method ?? "GET";
	// GET/HEAD with a body throws a TypeError at the Fetch layer — the
	// config type permits the combination, but neither method has body
	// semantics, so the body is simply not meaningful to send for them.
	const hasBody = input.body !== undefined && method !== "GET" && method !== "HEAD";
	const needsBody = (input.assertions ?? []).some((a) => a.source === "body");
	const start = Date.now();

	let response: Response;
	let bodyText = "";
	try {
		response = await doFetch(url, {
			method,
			...(hasBody ? { body: input.body } : {}),
			...(opts.headers ? { headers: opts.headers } : {}),
			redirect: "manual",
			signal: AbortSignal.timeout(opts.timeoutMs ?? 10_000),
		});
		if (needsBody) bodyText = await readBodyCapped(response, opts.maxBodyBytes ?? 1_000_000);
	} catch (err) {
		return { passed: false, failures: [], requestError: requestErrorMessage(err) };
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

/** Swaps in `overrideUrl`'s origin, keeping `originalUrl`'s own path + query. */
function resolveUrl(originalUrl: string, overrideUrl: string | undefined): string {
	if (!overrideUrl) return originalUrl;
	const original = new URL(originalUrl);
	const resolved = new URL(overrideUrl);
	resolved.pathname = original.pathname;
	resolved.search = original.search;
	return resolved.toString();
}

function requestErrorMessage(err: unknown): string {
	if (err instanceof Error) {
		return err.name === "TimeoutError" ? `request timed out: ${err.message}` : err.message;
	}
	return String(err);
}

/** Reads up to `maxBytes` of the response body, discarding the rest — a large/unending body can't exhaust memory. */
async function readBodyCapped(response: Response, maxBytes: number): Promise<string> {
	if (!response.body) return "";
	const reader = response.body.getReader();
	const chunks: Uint8Array[] = [];
	let total = 0;
	try {
		for (;;) {
			const { done, value } = await reader.read();
			if (done) break;
			const remaining = maxBytes - total;
			if (remaining <= 0) break;
			const stored = value.length > remaining ? value.slice(0, remaining) : value;
			chunks.push(stored);
			total += stored.length;
		}
	} finally {
		await reader.cancel().catch(() => {});
	}
	return Buffer.concat(chunks.map((c) => Buffer.from(c))).toString("utf8");
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
