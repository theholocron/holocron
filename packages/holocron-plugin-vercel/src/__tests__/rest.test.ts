import { ProviderApiError } from "@theholocron/cli";
import { describe, expect, it, vi } from "vitest";

import { createVercelRestClient } from "../rest.js";

import { stubFetch } from "./helpers.js";

const TOKEN = "vercel-pat";

describe("VercelRestClient", () => {
	it("sends a bearer token on every request", async () => {
		const { fetch, calls } = stubFetch([{ status: 200, body: { ok: true } }]);
		const client = createVercelRestClient({ token: TOKEN, fetch });
		await client.request("/v10/projects");
		expect(calls[0]?.headers.authorization).toBe(`Bearer ${TOKEN}`);
		expect(calls[0]?.headers.accept).toBe("application/json");
	});

	it("appends teamId as a query param when configured", async () => {
		const { fetch, calls } = stubFetch([{ status: 200, body: {} }]);
		const client = createVercelRestClient({ token: TOKEN, teamId: "team_xx", fetch });
		await client.request("/v10/projects");
		expect(calls[0]?.url).toBe("https://api.vercel.com/v10/projects?teamId=team_xx");
	});

	it("merges request-level query params with teamId", async () => {
		const { fetch, calls } = stubFetch([{ status: 200, body: {} }]);
		const client = createVercelRestClient({ token: TOKEN, teamId: "team_xx", fetch });
		await client.request("/v10/projects/abc/env", {
			method: "POST",
			query: { upsert: "true" },
			body: { key: "X", value: "v" },
		});
		expect(calls[0]?.url).toBe("https://api.vercel.com/v10/projects/abc/env?teamId=team_xx&upsert=true");
		expect(calls[0]?.body).toEqual({ key: "X", value: "v" });
		expect(calls[0]?.headers["content-type"]).toBe("application/json");
	});

	it("returns undefined for 204 responses", async () => {
		const { fetch } = stubFetch([{ status: 204 }]);
		const client = createVercelRestClient({ token: TOKEN, fetch });
		expect(await client.request("/v9/projects/abc", { method: "DELETE" })).toBeUndefined();
	});

	it("throws ProviderApiError with status + path on non-2xx", async () => {
		const { fetch } = stubFetch([{ status: 404, text: "project not found" }]);
		const client = createVercelRestClient({ token: TOKEN, fetch });
		const err = await client.request("/v10/projects/missing").catch((e: unknown) => e);
		expect(err).toBeInstanceOf(ProviderApiError);
		const pae = err as ProviderApiError;
		expect(pae.status).toBe(404);
		expect(pae.message).toContain("404");
		expect(pae.message).toContain("/v10/projects/missing");
	});

	it("wraps transport-level failures with status 0 and a clear message", async () => {
		const failingFetch: typeof fetch = vi.fn(async () => {
			throw new TypeError("fetch failed");
		});
		const client = createVercelRestClient({ token: TOKEN, fetch: failingFetch });
		const err = await client.request("/v10/projects").catch((e: unknown) => e);
		expect(err).toBeInstanceOf(ProviderApiError);
		const pae = err as ProviderApiError;
		expect(pae.status).toBe(0);
		expect(pae.message).toContain("Vercel GET /v10/projects failed");
	});

	it("strips trailing slashes from baseUrl override", async () => {
		const { fetch, calls } = stubFetch([{ status: 200, body: {} }]);
		const client = createVercelRestClient({
			token: TOKEN,
			fetch,
			baseUrl: "https://example.test/",
		});
		await client.request("/v10/projects");
		expect(calls[0]?.url).toBe("https://example.test/v10/projects");
	});
});
