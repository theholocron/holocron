import { type Mock, vi } from "vitest";

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

export function stubFetch(responses: Array<{ status?: number; body?: unknown }>): FetchStub {
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
		const next = responses[i++] ?? { status: 200, body: { ok: true } };
		const status = next.status ?? 200;
		if (status === 204) return new Response(null, { status });
		return new Response(JSON.stringify(next.body ?? {}), { status });
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
