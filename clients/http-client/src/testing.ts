/* v8 ignore file -- exercised by other packages' test suites, not this package's own; a source-level
 * directive survives regardless of which vitest config resolves (local vs. shared), unlike a
 * config-file `coverage.exclude` entry. */
import { vi } from "vitest";

/** One request a stubbed `fetch` received. */
export interface FetchCall {
	/** The address that was requested. */
	url: string;
	/** The HTTP method, upper-cased; `GET` when none was given. */
	method: string;
	/** The request headers, as given. */
	headers: Record<string, string>;
	/** The body: parsed when it was a JSON string, as given otherwise, and `null` when there was none. */
	body: unknown;
}

/**
 * A `fetch` that answers each call with the next of `responses` (a 200 with an empty body once they run out) and
 * records every call it receives.
 */
export function stubFetch(
	responses: Array<{ status?: number; body?: unknown; text?: string; headers?: Record<string, string> }>
) {
	const calls: FetchCall[] = [];
	let i = 0;
	const mock = vi.fn(async (input: string | URL, init?: RequestInit) => {
		const url = typeof input === "string" ? input : input.toString();
		const body = typeof init?.body === "string" ? JSON.parse(init.body) : (init?.body ?? null);
		calls.push({
			url,
			method: (init?.method ?? "GET").toUpperCase(),
			headers: (init?.headers as Record<string, string>) ?? {},
			body,
		});
		const next = responses[i++] ?? { status: 200, body: {} };
		const status = next.status ?? 200;
		if (status === 204) return new Response(null, { status, headers: next.headers });
		const text = next.text ?? JSON.stringify(next.body ?? {});
		return new Response(text, { status, headers: next.headers });
	});
	return { fetch: mock as unknown as typeof fetch, calls };
}
