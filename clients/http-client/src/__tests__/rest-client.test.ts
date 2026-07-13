import { describe, expect, it, vi } from "vitest";

import { ProviderApiError } from "../errors.js";
import { createRestClient } from "../rest-client.js";

function stubFetch(
	responses: Array<{ status?: number; body?: unknown; text?: string }>,
) {
	const calls: Array<{
		url: string;
		method: string;
		headers: Record<string, string>;
		body: unknown;
	}> = [];
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

const TOKEN = "test-token";

describe("createRestClient — bearer auth", () => {
	it("sends Authorization: Bearer header", async () => {
		const { fetch, calls } = stubFetch([{ body: {} }]);
		await createRestClient({
			baseUrl: "https://api.example.com",
			token: TOKEN,
			fetch,
		}).request("/ping");
		expect(calls[0]?.headers.authorization).toBe(`Bearer ${TOKEN}`);
	});

	it("sets accept: application/json by default", async () => {
		const { fetch, calls } = stubFetch([{ body: {} }]);
		await createRestClient({
			baseUrl: "https://api.example.com",
			token: TOKEN,
			fetch,
		}).request("/ping");
		expect(calls[0]?.headers.accept).toBe("application/json");
	});
});

describe("createRestClient — apikey tokenScheme", () => {
	it("sends token in custom header instead of Authorization", async () => {
		const { fetch, calls } = stubFetch([{ body: {} }]);
		await createRestClient({
			baseUrl: "https://api.example.com",
			token: TOKEN,
			tokenScheme: "apikey",
			apiKeyHeader: "x-api-key",
			fetch,
		}).request("/ping");
		expect(calls[0]?.headers["x-api-key"]).toBe(TOKEN);
		expect(calls[0]?.headers.authorization).toBeUndefined();
	});
});

describe("createRestClient — extraHeaders", () => {
	it("can override default accept header", async () => {
		const { fetch, calls } = stubFetch([{ body: {} }]);
		await createRestClient({
			baseUrl: "https://api.github.com",
			token: TOKEN,
			extraHeaders: {
				accept: "application/vnd.github+json",
				"x-github-api-version": "2022-11-28",
			},
			fetch,
		}).request("/user");
		expect(calls[0]?.headers.accept).toBe("application/vnd.github+json");
		expect(calls[0]?.headers["x-github-api-version"]).toBe("2022-11-28");
	});
});

describe("createRestClient — defaultQuery", () => {
	it("appends to every request URL", async () => {
		const { fetch, calls } = stubFetch([{ body: {} }]);
		await createRestClient({
			baseUrl: "https://api.vercel.com",
			token: TOKEN,
			defaultQuery: { teamId: "team_abc" },
			fetch,
		}).request("/projects");
		expect(calls[0]?.url).toBe(
			"https://api.vercel.com/projects?teamId=team_abc",
		);
	});
});

describe("createRestClient — 204 / no-content", () => {
	it("returns undefined for 204", async () => {
		const { fetch } = stubFetch([{ status: 204 }]);
		const result = await createRestClient({
			baseUrl: "https://api.example.com",
			token: TOKEN,
			fetch,
		}).request("/del");
		expect(result).toBeUndefined();
	});

	it("returns undefined when expectNoContent is set", async () => {
		const { fetch } = stubFetch([{ status: 200 }]);
		const result = await createRestClient({
			baseUrl: "https://api.example.com",
			token: TOKEN,
			fetch,
		}).request("/put", { expectNoContent: true });
		expect(result).toBeUndefined();
	});
});

describe("createRestClient — error handling", () => {
	it("throws ProviderApiError with status on non-2xx", async () => {
		const { fetch } = stubFetch([{ status: 401, text: "unauthorized" }]);
		const err = await createRestClient({
			baseUrl: "https://api.example.com",
			token: TOKEN,
			vendor: "Example",
			fetch,
		})
			.request("/user")
			.catch((e: unknown) => e);
		expect(err).toBeInstanceOf(ProviderApiError);
		expect((err as ProviderApiError).status).toBe(401);
		expect((err as ProviderApiError).message).toContain(
			"Example GET /user → 401",
		);
	});

	it("wraps transport failure as ProviderApiError with status 0", async () => {
		const fetch = vi.fn(async () => {
			throw new TypeError("fetch failed");
		}) as unknown as typeof globalThis.fetch;
		const err = await createRestClient({
			baseUrl: "https://api.example.com",
			token: TOKEN,
			vendor: "Example",
			fetch,
		})
			.request("/ping")
			.catch((e: unknown) => e);
		expect(err).toBeInstanceOf(ProviderApiError);
		expect((err as ProviderApiError).status).toBe(0);
		expect((err as ProviderApiError).message).toContain(
			"Example GET /ping failed",
		);
	});

	it("trims trailing slashes from baseUrl", async () => {
		const { fetch, calls } = stubFetch([{ body: {} }]);
		await createRestClient({
			baseUrl: "https://api.example.com///",
			token: TOKEN,
			fetch,
		}).request("/foo");
		expect(calls[0]?.url).toBe("https://api.example.com/foo");
	});
});
