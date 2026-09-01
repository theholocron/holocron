import { ProviderApiError } from "@theholocron/cli";
import { describe, expect, it, vi } from "vitest";

import { CloudflareWorkers } from "../capabilities/workers.js";
import { cfOk, stubFetch } from "./helpers.js";

const BASE = "https://cf.test/client/v4";
const ACCOUNT = "acct-123";
const ZONE_ID = "zone-abc";
const TOKEN = "cf-tok";
const HOSTNAME = "wiki.example.com";
const SCRIPT_NAME = "wiki-example-com-proxy";
const PATTERN = `${HOSTNAME}/*`;

const PROXY_CONFIG = {
	target: "https://app.buildwithfern.com",
	headers: { "X-Fern-Host": HOSTNAME },
};

const zone = { id: ZONE_ID, name: "example.com", status: "active" };
const route = { id: "route-1", pattern: PATTERN, script: SCRIPT_NAME };

function makeWorkers(responses: Parameters<typeof stubFetch>[0]) {
	const { fetch, calls } = stubFetch(responses);
	const zones = {
		list: vi.fn().mockResolvedValue([zone]),
	};
	const workers = new CloudflareWorkers(zones, ACCOUNT, { token: TOKEN, baseUrl: BASE, fetch });
	return { workers, calls, zones };
}

describe("CloudflareWorkers.upsertProxy — creates route when none exists", () => {
	it("deploys script then creates a new route", async () => {
		// putScript (200), listRoutes (empty), createRoute
		const { workers, calls } = makeWorkers([
			{ status: 200 },
			cfOk([]),
			cfOk(route),
		]);
		await workers.upsertProxy(HOSTNAME, PROXY_CONFIG);

		expect(calls[0]?.method).toBe("PUT");
		expect(calls[0]?.url).toContain(`/accounts/${ACCOUNT}/workers/scripts/${SCRIPT_NAME}`);
		expect(calls[0]?.headers.authorization).toBe(`Bearer ${TOKEN}`);
		expect(calls[0]?.body).toBeInstanceOf(FormData);

		expect(calls[1]?.method).toBe("GET");
		expect(calls[1]?.url).toContain(`/zones/${ZONE_ID}/workers/routes`);

		expect(calls[2]?.method).toBe("POST");
		expect(calls[2]?.body).toEqual({ pattern: PATTERN, script: SCRIPT_NAME });
	});
});

describe("CloudflareWorkers.upsertProxy — updates existing route when script differs", () => {
	it("deploys script then PUTs the route with the new script name", async () => {
		const staleRoute = { id: "route-1", pattern: PATTERN, script: "old-script" };
		const { workers, calls } = makeWorkers([
			{ status: 200 },
			cfOk([staleRoute]),
			cfOk({ ...staleRoute, script: SCRIPT_NAME }),
		]);
		await workers.upsertProxy(HOSTNAME, PROXY_CONFIG);

		expect(calls[2]?.method).toBe("PUT");
		expect(calls[2]?.url).toContain(`/zones/${ZONE_ID}/workers/routes/route-1`);
		expect(calls[2]?.body).toEqual({ pattern: PATTERN, script: SCRIPT_NAME });
	});
});

describe("CloudflareWorkers.upsertProxy — skips route update when script unchanged", () => {
	it("makes no route update call when script already matches", async () => {
		const { workers, calls } = makeWorkers([{ status: 200 }, cfOk([route])]);
		await workers.upsertProxy(HOSTNAME, PROXY_CONFIG);
		expect(calls).toHaveLength(2);
	});
});

describe("CloudflareWorkers.upsertProxy — zone resolution", () => {
	it("walks up to apex zone when subdomain is not a direct zone", async () => {
		const { fetch } = stubFetch([{ status: 200 }, cfOk([]), cfOk(route)]);
		const zones = { list: vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([zone]) };
		const workers = new CloudflareWorkers(zones, ACCOUNT, { token: TOKEN, baseUrl: BASE, fetch });
		await workers.upsertProxy(HOSTNAME, PROXY_CONFIG);
		expect(zones.list).toHaveBeenCalledTimes(2);
		expect(zones.list).toHaveBeenLastCalledWith({ name: "example.com" });
	});

	it("throws ProviderApiError when no zone is found", async () => {
		const { fetch } = stubFetch([{ status: 200 }]);
		const zones = { list: vi.fn().mockResolvedValue([]) };
		const workers = new CloudflareWorkers(zones, ACCOUNT, { token: TOKEN, baseUrl: BASE, fetch });
		await expect(workers.upsertProxy(HOSTNAME, PROXY_CONFIG)).rejects.toThrow(ProviderApiError);
	});

	it("uses cached zone id on second call", async () => {
		const { fetch } = stubFetch([{ status: 200 }, cfOk([route]), { status: 200 }, cfOk([route])]);
		const zones = { list: vi.fn().mockResolvedValue([zone]) };
		const workers = new CloudflareWorkers(zones, ACCOUNT, { token: TOKEN, baseUrl: BASE, fetch });
		await workers.upsertProxy(HOSTNAME, PROXY_CONFIG);
		await workers.upsertProxy(HOSTNAME, PROXY_CONFIG);
		expect(zones.list).toHaveBeenCalledTimes(1);
	});
});

describe("CloudflareWorkers — error handling", () => {
	it("throws ProviderApiError when putScript returns non-ok", async () => {
		const { workers } = makeWorkers([{ status: 403, text: "Forbidden" }]);
		await expect(workers.upsertProxy(HOSTNAME, PROXY_CONFIG)).rejects.toThrow(
			`Cloudflare PUT /accounts/${ACCOUNT}/workers/scripts/${SCRIPT_NAME} → 403`
		);
	});

	it("throws ProviderApiError when listRoutes returns non-ok status", async () => {
		const { workers } = makeWorkers([{ status: 200 }, { status: 500, text: "server error" }]);
		await expect(workers.upsertProxy(HOSTNAME, PROXY_CONFIG)).rejects.toThrow(
			`Cloudflare GET /zones/${ZONE_ID}/workers/routes → 500`
		);
	});

	it("throws ProviderApiError when listRoutes returns success:false", async () => {
		const { workers } = makeWorkers([
			{ status: 200 },
			{ status: 200, body: { success: false, errors: [{ message: "bad" }], result: null } },
		]);
		await expect(workers.upsertProxy(HOSTNAME, PROXY_CONFIG)).rejects.toThrow(ProviderApiError);
	});

	it("falls back to globalThis.fetch and default baseUrl when neither is provided", async () => {
		const mockFetch = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
		vi.stubGlobal("fetch", mockFetch);
		try {
			const zones = { list: vi.fn().mockResolvedValue([zone]) };
			const workers = new CloudflareWorkers(zones, ACCOUNT, { token: TOKEN });
			await workers.upsertProxy(HOSTNAME, PROXY_CONFIG).catch(() => {});
			expect(mockFetch).toHaveBeenCalled();
			expect(mockFetch.mock.calls[0]?.[0]).toContain("https://api.cloudflare.com/client/v4");
		} finally {
			vi.unstubAllGlobals();
		}
	});
});
