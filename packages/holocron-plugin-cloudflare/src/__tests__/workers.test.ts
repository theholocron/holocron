import { ProviderApiError } from "@theholocron/cli";
import { stubFetch } from "@theholocron/http-client/testing";
import { describe, expect, it } from "vitest";

import { CloudflareWorkers } from "../capabilities/workers.js";
import { createCloudflareClient } from "../rest.js";
import { cfOk } from "./helpers.js";

const BASE = "https://cf.test/client/v4";
const ACCOUNT = "acct-123";
const ZONE_ID = "zone-abc";
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
	const client = createCloudflareClient({ token: "cf-tok", baseUrl: BASE, fetch });
	return { workers: new CloudflareWorkers(() => client, ACCOUNT), calls };
}

describe("CloudflareWorkers.upsertProxy — creates route when none exists", () => {
	it("deploys script then creates a new route", async () => {
		// putScript (200), zones.list (resolves zone), listRoutes (empty), createRoute
		const { workers, calls } = makeWorkers([{ status: 200 }, cfOk([zone]), cfOk([]), cfOk(route)]);
		await workers.upsertProxy(HOSTNAME, PROXY_CONFIG);

		expect(calls[0]?.method).toBe("PUT");
		expect(calls[0]?.url).toContain(`/accounts/${ACCOUNT}/workers/scripts/${SCRIPT_NAME}`);
		expect(calls[0]?.body).toBeInstanceOf(FormData);

		expect(calls[2]?.method).toBe("GET");
		expect(calls[2]?.url).toContain(`/zones/${ZONE_ID}/workers/routes`);

		expect(calls[3]?.method).toBe("POST");
		expect(calls[3]?.body).toEqual({ pattern: PATTERN, script: SCRIPT_NAME });
	});
});

describe("CloudflareWorkers.upsertProxy — updates existing route when script differs", () => {
	it("deploys script then PUTs the route with the new script name", async () => {
		const staleRoute = { id: "route-1", pattern: PATTERN, script: "old-script" };
		const { workers, calls } = makeWorkers([
			{ status: 200 },
			cfOk([zone]),
			cfOk([staleRoute]),
			cfOk({ ...staleRoute, script: SCRIPT_NAME }),
		]);
		await workers.upsertProxy(HOSTNAME, PROXY_CONFIG);

		expect(calls[3]?.method).toBe("PUT");
		expect(calls[3]?.url).toContain(`/zones/${ZONE_ID}/workers/routes/route-1`);
		expect(calls[3]?.body).toEqual({ pattern: PATTERN, script: SCRIPT_NAME });
	});
});

describe("CloudflareWorkers.upsertProxy — skips route update when script unchanged", () => {
	it("makes no route update call when script already matches", async () => {
		const { workers, calls } = makeWorkers([{ status: 200 }, cfOk([zone]), cfOk([route])]);
		await workers.upsertProxy(HOSTNAME, PROXY_CONFIG);
		expect(calls).toHaveLength(3);
	});
});

describe("CloudflareWorkers — zone resolution", () => {
	it("walks up to apex zone when subdomain is not a direct zone", async () => {
		// putScript, zones.list("wiki.example.com") empty, zones.list("example.com") found, listRoutes, createRoute
		const { workers, calls } = makeWorkers([{ status: 200 }, cfOk([]), cfOk([zone]), cfOk([]), cfOk(route)]);
		await workers.upsertProxy(HOSTNAME, PROXY_CONFIG);
		const zoneLookups = calls.filter((c) => c.url.includes("/zones?"));
		expect(zoneLookups).toHaveLength(2);
		expect(zoneLookups[1]?.url).toContain("name=example.com");
	});

	it("throws ProviderApiError when no zone is found", async () => {
		// putScript, then both zone-lookup candidates ("wiki.example.com", "example.com") come back empty
		const { workers } = makeWorkers([{ status: 200 }, cfOk([]), cfOk([])]);
		await expect(workers.upsertProxy(HOSTNAME, PROXY_CONFIG)).rejects.toThrow(ProviderApiError);
	});

	it("uses cached zone id on second call", async () => {
		// 1st upsertProxy: putScript, zones.list (resolves + caches), listRoutes (matches, no write)
		// 2nd upsertProxy: putScript, [zone cached — no zones.list], listRoutes (matches, no write)
		const { workers, calls } = makeWorkers([
			{ status: 200 },
			cfOk([zone]),
			cfOk([route]),
			{ status: 200 },
			cfOk([route]),
		]);
		await workers.upsertProxy(HOSTNAME, PROXY_CONFIG);
		await workers.upsertProxy(HOSTNAME, PROXY_CONFIG);
		const zoneLookups = calls.filter((c) => c.url.includes("/zones?"));
		expect(zoneLookups).toHaveLength(1);
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
		const { workers } = makeWorkers([{ status: 200 }, cfOk([zone]), { status: 500, text: "server error" }]);
		await expect(workers.upsertProxy(HOSTNAME, PROXY_CONFIG)).rejects.toThrow(
			`Cloudflare GET /zones/${ZONE_ID}/workers/routes → 500`
		);
	});

	it("throws ProviderApiError when listRoutes returns success:false", async () => {
		const { workers } = makeWorkers([
			{ status: 200 },
			cfOk([zone]),
			{ status: 200, body: { success: false, errors: [{ message: "bad" }], result: null } },
		]);
		await expect(workers.upsertProxy(HOSTNAME, PROXY_CONFIG)).rejects.toThrow(ProviderApiError);
	});
});

describe("CloudflareWorkers.deployScript", () => {
	it("deploys the given code and returns the script name", async () => {
		const { workers, calls } = makeWorkers([{ status: 200 }]);
		const result = await workers.deployScript("sentinel", { code: "export default { fetch() {} };" });

		expect(calls).toHaveLength(1);
		expect(calls[0]?.method).toBe("PUT");
		expect(calls[0]?.url).toContain(`/accounts/${ACCOUNT}/workers/scripts/sentinel`);
		expect(result).toEqual({ scriptName: "sentinel" });
	});

	it("sets every secret in config.secrets", async () => {
		const { workers, calls } = makeWorkers([
			{ status: 200 }, // putScript
			cfOk({ name: "WEBHOOK_SECRET", type: "secret_text" }),
			cfOk({ name: "APP_PRIVATE_KEY", type: "secret_text" }),
		]);
		await workers.deployScript("sentinel", {
			code: "export default {};",
			secrets: { WEBHOOK_SECRET: "shh", APP_PRIVATE_KEY: "-----BEGIN..." },
		});

		expect(calls[1]?.url).toContain(`/accounts/${ACCOUNT}/workers/scripts/sentinel/secrets`);
		expect(calls[1]?.body).toEqual({ name: "WEBHOOK_SECRET", text: "shh", type: "secret_text" });
		expect(calls[2]?.body).toEqual({ name: "APP_PRIVATE_KEY", text: "-----BEGIN...", type: "secret_text" });
	});

	it("creates a route for each pattern in config.routes that doesn't already exist", async () => {
		const { workers, calls } = makeWorkers([
			{ status: 200 }, // putScript
			cfOk([zone]), // zones.list
			cfOk([]), // listRoutes — empty
			cfOk({ id: "r1", pattern: "sentinel.example.com/*", script: "sentinel" }), // createRoute
		]);
		await workers.deployScript("sentinel", { code: "export default {};", routes: ["sentinel.example.com/*"] });

		expect(calls[3]?.method).toBe("POST");
		expect(calls[3]?.url).toContain(`/zones/${ZONE_ID}/workers/routes`);
		expect(calls[3]?.body).toEqual({ pattern: "sentinel.example.com/*", script: "sentinel" });
	});

	it("updates an existing route when its script name differs", async () => {
		const existing = { id: "route-9", pattern: "sentinel.example.com/*", script: "old" };
		const { workers, calls } = makeWorkers([
			{ status: 200 },
			cfOk([zone]),
			cfOk([existing]),
			cfOk({ ...existing, script: "sentinel" }),
		]);
		await workers.deployScript("sentinel", { code: "export default {};", routes: ["sentinel.example.com/*"] });

		expect(calls[3]?.method).toBe("PUT");
		expect(calls[3]?.url).toContain(`/zones/${ZONE_ID}/workers/routes/route-9`);
	});

	it("wires no routes when config.routes is omitted", async () => {
		const { workers, calls } = makeWorkers([{ status: 200 }]);
		await workers.deployScript("sentinel", { code: "export default {};" });
		expect(calls).toHaveLength(1);
	});
});
