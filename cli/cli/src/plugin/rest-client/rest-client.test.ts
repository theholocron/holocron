import { ProviderApiError } from "@theholocron/cli";
import { describe, expect, it, vi } from "vitest";

import { createRestClient } from "./rest-client.js";

function stubFetch(responses: Array<{ status?: number; body?: unknown; text?: string }>) {
	const calls: Array<{ url: string; method: string; headers: Record<string, string>; body: unknown }> = [];
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
		if (status === 204) return new Response(null, { status });
		const text = next.text ?? JSON.stringify(next.body ?? {});
		return new Response(text, { status });
	});
	return { fetch: mock as unknown as typeof fetch, calls };
}

const TOKEN = "test-token";

describe("createRestClient", () => {
	describe("bearer auth (default)", () => {
		it("sends Authorization: Bearer header", async () => {
			const { fetch, calls } = stubFetch([{ status: 200, body: { ok: true } }]);
			const client = createRestClient({ baseUrl: "https://api.example.com", token: TOKEN, fetch });
			await client.request("/ping");
			expect(calls[0]?.headers.authorization).toBe(`Bearer ${TOKEN}`);
		});

		it("sets accept: application/json by default", async () => {
			const { fetch, calls } = stubFetch([{ status: 200, body: {} }]);
			const client = createRestClient({ baseUrl: "https://api.example.com", token: TOKEN, fetch });
			await client.request("/ping");
			expect(calls[0]?.headers.accept).toBe("application/json");
		});
	});

	describe("apikey tokenScheme", () => {
		it("sends token in custom header, no Authorization", async () => {
			const { fetch, calls } = stubFetch([{ status: 200, body: {} }]);
			const client = createRestClient({
				baseUrl: "https://api.example.com",
				token: TOKEN,
				tokenScheme: "apikey",
				apiKeyHeader: "x-api-key",
				fetch,
			});
			await client.request("/ping");
			expect(calls[0]?.headers["x-api-key"]).toBe(TOKEN);
			expect(calls[0]?.headers.authorization).toBeUndefined();
		});
	});

	describe("extraHeaders", () => {
		it("overrides default accept header", async () => {
			const { fetch, calls } = stubFetch([{ status: 200, body: {} }]);
			const client = createRestClient({
				baseUrl: "https://api.github.com",
				token: TOKEN,
				extraHeaders: { accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28" },
				fetch,
			});
			await client.request("/user");
			expect(calls[0]?.headers.accept).toBe("application/vnd.github+json");
			expect(calls[0]?.headers["x-github-api-version"]).toBe("2022-11-28");
		});
	});

	describe("defaultQuery", () => {
		it("appends to every request URL", async () => {
			const { fetch, calls } = stubFetch([{ status: 200, body: {} }]);
			const client = createRestClient({
				baseUrl: "https://api.vercel.com",
				token: TOKEN,
				defaultQuery: { teamId: "team_abc" },
				fetch,
			});
			await client.request("/projects");
			expect(calls[0]?.url).toBe("https://api.vercel.com/projects?teamId=team_abc");
		});

		it("merges with per-request query", async () => {
			const { fetch, calls } = stubFetch([{ status: 200, body: {} }]);
			const client = createRestClient({
				baseUrl: "https://api.vercel.com",
				token: TOKEN,
				defaultQuery: { teamId: "team_abc" },
				fetch,
			});
			await client.request("/projects", { query: { limit: "10" } });
			const url = new URL(calls[0]!.url);
			expect(url.searchParams.get("teamId")).toBe("team_abc");
			expect(url.searchParams.get("limit")).toBe("10");
		});
	});

	describe("request method / body", () => {
		it("defaults to GET", async () => {
			const { fetch, calls } = stubFetch([{ status: 200, body: {} }]);
			const client = createRestClient({ baseUrl: "https://api.example.com", token: TOKEN, fetch });
			await client.request("/ping");
			expect(calls[0]?.method).toBe("GET");
		});

		it("serializes body as JSON and sets content-type on POST", async () => {
			const { fetch, calls } = stubFetch([{ status: 201, body: { id: 1 } }]);
			const client = createRestClient({ baseUrl: "https://api.example.com", token: TOKEN, fetch });
			await client.request("/items", { method: "POST", body: { name: "test" } });
			expect(calls[0]?.method).toBe("POST");
			expect(calls[0]?.body).toEqual({ name: "test" });
			expect(calls[0]?.headers["content-type"]).toBe("application/json");
		});
	});

	describe("204 / no-content handling", () => {
		it("returns undefined for 204", async () => {
			const { fetch } = stubFetch([{ status: 204 }]);
			const client = createRestClient({ baseUrl: "https://api.example.com", token: TOKEN, fetch });
			expect(await client.request("/del")).toBeUndefined();
		});

		it("returns undefined when expectNoContent is set even on 200", async () => {
			const { fetch } = stubFetch([{ status: 200 }]);
			const client = createRestClient({ baseUrl: "https://api.example.com", token: TOKEN, fetch });
			expect(await client.request("/put", { expectNoContent: true })).toBeUndefined();
		});
	});

	describe("trailing-slash trim", () => {
		it("strips trailing slashes from baseUrl", async () => {
			const { fetch, calls } = stubFetch([{ status: 200, body: {} }]);
			const client = createRestClient({ baseUrl: "https://api.example.com///", token: TOKEN, fetch });
			await client.request("/foo");
			expect(calls[0]?.url).toBe("https://api.example.com/foo");
		});
	});

	describe("error handling", () => {
		it("throws ProviderApiError with status on non-2xx", async () => {
			const { fetch } = stubFetch([{ status: 401, text: "unauthorized" }]);
			const client = createRestClient({
				baseUrl: "https://api.example.com",
				token: TOKEN,
				vendor: "Example",
				fetch,
			});
			const err = await client.request("/user").catch((e: unknown) => e);
			expect(err).toBeInstanceOf(ProviderApiError);
			expect((err as ProviderApiError).status).toBe(401);
			expect((err as ProviderApiError).details).toBe("unauthorized");
			expect((err as ProviderApiError).message).toContain("Example GET /user → 401");
		});

		it("wraps transport failure as ProviderApiError with status 0", async () => {
			const fetch = vi.fn(async () => {
				throw new TypeError("fetch failed");
			}) as unknown as typeof globalThis.fetch;
			const client = createRestClient({
				baseUrl: "https://api.example.com",
				token: TOKEN,
				vendor: "Example",
				fetch,
			});
			const err = await client.request("/ping").catch((e: unknown) => e);
			expect(err).toBeInstanceOf(ProviderApiError);
			expect((err as ProviderApiError).status).toBe(0);
			expect((err as ProviderApiError).message).toContain("Example GET /ping failed");
		});
	});
});
