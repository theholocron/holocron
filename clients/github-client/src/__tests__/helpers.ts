import { vi } from "vitest";

export interface FetchCall {
	url: string;
	method: string;
	headers: Record<string, string>;
	body: unknown;
}

export function stubFetch(
	responses: Array<{ status?: number; body?: unknown; text?: string }>,
) {
	const calls: FetchCall[] = [];
	let i = 0;
	const mock = vi.fn(async (input: string | URL, init?: RequestInit) => {
		const url = typeof input === "string" ? input : input.toString();
		const body =
			typeof init?.body === "string"
				? JSON.parse(init.body)
				: (init?.body ?? null);
		calls.push({
			url,
			method: (init?.method ?? "GET").toUpperCase(),
			headers: (init?.headers as Record<string, string>) ?? {},
			body,
		});
		const next = responses[i++] ?? { status: 200, body: {} };
		const status = next.status ?? 200;
		if (status === 204) return new Response(null, { status });
		const text = next.text ?? JSON.stringify(next.body ?? {});
		return new Response(text, { status });
	});
	return { fetch: mock as unknown as typeof fetch, calls };
}

export const TOKEN = "ghp_test_token";
export const REPO = "theholocron/test-repo";
