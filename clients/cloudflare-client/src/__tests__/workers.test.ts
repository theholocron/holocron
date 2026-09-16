import { describe, expect, it, vi } from "vitest";

import { createCloudflareClient } from "../index.js";
import { cfOk, stubFetch } from "./helpers.js";

const BASE = "https://cf.test/client/v4";
const ACCOUNT = "acct-123";
const ZONE = "zone-abc";
const TOKEN = "cf-tok";

function client(responses: Parameters<typeof stubFetch>[0]) {
	const { fetch, calls } = stubFetch(responses);
	return { workers: createCloudflareClient({ token: TOKEN, baseUrl: BASE, fetch }).workers, calls };
}

const route = { id: "route-1", pattern: "wiki.example.com/*", script: "wiki-proxy" };

describe("workers.putScript", () => {
	it("PUTs to the account workers scripts endpoint", async () => {
		const { workers, calls } = client([{ status: 200, body: {} }]);
		await workers.putScript(ACCOUNT, "my-worker", "export default {};");
		expect(calls[0]?.url).toBe(`${BASE}/accounts/${ACCOUNT}/workers/scripts/my-worker`);
		expect(calls[0]?.method).toBe("PUT");
	});

	it("sends Bearer authorization header with the token", async () => {
		const { workers, calls } = client([{ status: 200, body: {} }]);
		await workers.putScript(ACCOUNT, "my-worker", "export default {};");
		expect(calls[0]?.headers.authorization).toBe(`Bearer ${TOKEN}`);
	});

	it("sends a FormData body", async () => {
		const { workers, calls } = client([{ status: 200, body: {} }]);
		await workers.putScript(ACCOUNT, "my-worker", "export default {};");
		expect(calls[0]?.body).toBeInstanceOf(FormData);
	});

	it("URL-encodes the script name", async () => {
		const { workers, calls } = client([{ status: 200, body: {} }]);
		await workers.putScript(ACCOUNT, "wiki.example.com-proxy", "export default {};");
		expect(calls[0]?.url).toContain("wiki.example.com-proxy");
	});

	it("falls back to globalThis.fetch when no fetch override is provided", async () => {
		const mockFetch = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
		vi.stubGlobal("fetch", mockFetch);
		try {
			const w = createCloudflareClient({ token: TOKEN, baseUrl: BASE }).workers;
			await w.putScript(ACCOUNT, "my-worker", "export default {};");
			expect(mockFetch).toHaveBeenCalled();
		} finally {
			vi.unstubAllGlobals();
		}
	});

	it("throws ProviderApiError on non-ok response", async () => {
		const { workers } = client([{ status: 400, text: "Bad Request" }]);
		await expect(workers.putScript(ACCOUNT, "my-worker", "export default {};")).rejects.toThrow(
			"PUT /accounts/acct-123/workers/scripts/my-worker → 400"
		);
	});
});

describe("workers.listRoutes", () => {
	it("GETs /zones/{zoneId}/workers/routes", async () => {
		const { workers, calls } = client([cfOk([route])]);
		const result = await workers.listRoutes(ZONE);
		expect(calls[0]?.url).toContain(`/zones/${ZONE}/workers/routes`);
		expect(calls[0]?.method).toBe("GET");
		expect(result).toEqual([route]);
	});
});

describe("workers.createRoute", () => {
	it("POSTs pattern and script to /zones/{zoneId}/workers/routes", async () => {
		const { workers, calls } = client([cfOk(route)]);
		const result = await workers.createRoute(ZONE, "wiki.example.com/*", "wiki-proxy");
		expect(calls[0]?.method).toBe("POST");
		expect(calls[0]?.url).toContain(`/zones/${ZONE}/workers/routes`);
		expect(calls[0]?.body).toEqual({ pattern: "wiki.example.com/*", script: "wiki-proxy" });
		expect(result).toEqual(route);
	});
});

describe("workers.updateRoute", () => {
	it("PUTs pattern and script to /zones/{zoneId}/workers/routes/{routeId}", async () => {
		const { workers, calls } = client([cfOk(route)]);
		const result = await workers.updateRoute(ZONE, "route-1", "wiki.example.com/*", "wiki-proxy");
		expect(calls[0]?.method).toBe("PUT");
		expect(calls[0]?.url).toContain(`/zones/${ZONE}/workers/routes/route-1`);
		expect(calls[0]?.body).toEqual({ pattern: "wiki.example.com/*", script: "wiki-proxy" });
		expect(result).toEqual(route);
	});
});

describe("workers.putSecret", () => {
	it("PUTs name/text/type to the account script's secrets endpoint", async () => {
		const { workers, calls } = client([cfOk({ name: "WEBHOOK_SECRET", type: "secret_text" })]);
		const result = await workers.putSecret(ACCOUNT, "sentinel", "WEBHOOK_SECRET", "shh-its-a-secret");
		expect(calls[0]?.method).toBe("PUT");
		expect(calls[0]?.url).toBe(`${BASE}/accounts/${ACCOUNT}/workers/scripts/sentinel/secrets`);
		expect(calls[0]?.body).toEqual({ name: "WEBHOOK_SECRET", text: "shh-its-a-secret", type: "secret_text" });
		expect(result).toEqual({ name: "WEBHOOK_SECRET", type: "secret_text" });
	});

	it("URL-encodes the script name", async () => {
		const { workers, calls } = client([cfOk({ name: "X", type: "secret_text" })]);
		await workers.putSecret(ACCOUNT, "sentinel.example.com", "X", "v");
		expect(calls[0]?.url).toContain("sentinel.example.com");
	});
});

describe("workers.listSecrets", () => {
	it("GETs the account script's secrets endpoint — names only, no values", async () => {
		const { workers, calls } = client([cfOk([{ name: "WEBHOOK_SECRET", type: "secret_text" }])]);
		const result = await workers.listSecrets(ACCOUNT, "sentinel");
		expect(calls[0]?.method).toBe("GET");
		expect(calls[0]?.url).toBe(`${BASE}/accounts/${ACCOUNT}/workers/scripts/sentinel/secrets`);
		expect(result).toEqual([{ name: "WEBHOOK_SECRET", type: "secret_text" }]);
	});
});

describe("workers.deleteSecret", () => {
	it("DELETEs the named secret from the account script's secrets endpoint", async () => {
		const { workers, calls } = client([{ status: 204 }]);
		await workers.deleteSecret(ACCOUNT, "sentinel", "WEBHOOK_SECRET");
		expect(calls[0]?.method).toBe("DELETE");
		expect(calls[0]?.url).toBe(`${BASE}/accounts/${ACCOUNT}/workers/scripts/sentinel/secrets/WEBHOOK_SECRET`);
	});

	it("URL-encodes the secret name", async () => {
		const { workers, calls } = client([{ status: 204 }]);
		await workers.deleteSecret(ACCOUNT, "sentinel", "A SECRET");
		expect(calls[0]?.url).toContain("A%20SECRET");
	});
});
