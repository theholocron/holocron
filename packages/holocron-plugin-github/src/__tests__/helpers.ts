import { vi, type Mock } from "vitest";

export interface FetchCall {
	url: string;
	method: string;
	headers: Record<string, string>;
	body: unknown;
}

export interface FetchStub {
	fetch: typeof fetch;
	calls: FetchCall[];
	mock: Mock;
}

/**
 * Build a stubbed `fetch` that returns the given responses in order.
 * Adapted from rando-id/rando.id's `__tests__/helpers.ts` stubFetch.
 */
export function stubFetch(responses: Array<{ status?: number; body?: unknown; text?: string }>): FetchStub {
	const calls: FetchCall[] = [];
	let i = 0;
	const mock = vi.fn(async (input: string | URL, init?: RequestInit) => {
		const url = typeof input === "string" ? input : input.toString();
		const body = typeof init?.body === "string" ? safeJsonParse(init.body) : (init?.body ?? null);
		calls.push({
			url,
			method: (init?.method ?? "GET").toUpperCase(),
			headers: (init?.headers as Record<string, string>) ?? {},
			body,
		});
		const next = responses[i++] ?? { status: 200, body: {} };
		const status = next.status ?? 200;
		// Per the Fetch spec, 204/205/304 responses can't carry a body. Tests
		// can still assert on the call; the body just isn't included.
		if (status === 204 || status === 205 || status === 304) {
			return new Response(null, { status });
		}
		const text = next.text ?? (typeof next.body === "string" ? next.body : JSON.stringify(next.body ?? {}));
		return new Response(text, { status });
	});
	return { fetch: mock as unknown as typeof fetch, calls, mock };
}

function safeJsonParse(s: string): unknown {
	try {
		return JSON.parse(s);
	} catch {
		return s;
	}
}
