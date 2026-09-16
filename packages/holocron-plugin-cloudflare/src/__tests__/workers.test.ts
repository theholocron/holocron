import { ProviderApiError } from "@theholocron/cli";
import type { CloudflareClient } from "@theholocron/cloudflare-client";
import { describe, expect, it, vi } from "vitest";

import { CloudflareWorkers } from "../capabilities/workers.js";

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

type FakeClient = Pick<CloudflareClient, "workers" | "zones">;

function makeClient(overrides: Partial<FakeClient["workers"]> = {}, zonesList = vi.fn().mockResolvedValue([zone])) {
	const workers = {
		putScript: vi.fn().mockResolvedValue(undefined),
		putSecret: vi.fn().mockResolvedValue({ name: "x", type: "secret_text" as const }),
		listRoutes: vi.fn().mockResolvedValue([]),
		createRoute: vi.fn().mockResolvedValue(route),
		updateRoute: vi.fn().mockResolvedValue(route),
		deleteSecret: vi.fn().mockResolvedValue(undefined),
		listSecrets: vi.fn().mockResolvedValue([]),
		...overrides,
	} as unknown as FakeClient["workers"];
	const zones = { list: zonesList } as unknown as FakeClient["zones"];
	const client: FakeClient = { workers, zones };
	const cloudflareWorkers = new CloudflareWorkers(() => client, ACCOUNT);
	return { cloudflareWorkers, workers, zones };
}

describe("CloudflareWorkers.upsertProxy", () => {
	it("deploys the proxy script then creates a route when none exists", async () => {
		const { cloudflareWorkers, workers } = makeClient({ listRoutes: vi.fn().mockResolvedValue([]) });
		await cloudflareWorkers.upsertProxy(HOSTNAME, PROXY_CONFIG);

		expect(workers.putScript).toHaveBeenCalledWith(ACCOUNT, SCRIPT_NAME, expect.stringContaining("fetch"));
		expect(workers.createRoute).toHaveBeenCalledWith(ZONE_ID, PATTERN, SCRIPT_NAME);
		expect(workers.updateRoute).not.toHaveBeenCalled();
	});

	it("updates the existing route when its script name differs", async () => {
		const staleRoute = { id: "route-1", pattern: PATTERN, script: "old-script" };
		const { cloudflareWorkers, workers } = makeClient({ listRoutes: vi.fn().mockResolvedValue([staleRoute]) });
		await cloudflareWorkers.upsertProxy(HOSTNAME, PROXY_CONFIG);

		expect(workers.updateRoute).toHaveBeenCalledWith(ZONE_ID, "route-1", PATTERN, SCRIPT_NAME);
		expect(workers.createRoute).not.toHaveBeenCalled();
	});

	it("makes no route write call when the existing route's script already matches", async () => {
		const { cloudflareWorkers, workers } = makeClient({ listRoutes: vi.fn().mockResolvedValue([route]) });
		await cloudflareWorkers.upsertProxy(HOSTNAME, PROXY_CONFIG);

		expect(workers.createRoute).not.toHaveBeenCalled();
		expect(workers.updateRoute).not.toHaveBeenCalled();
	});
});

describe("CloudflareWorkers — zone resolution", () => {
	it("walks up to the apex zone when the subdomain isn't a direct zone", async () => {
		const zonesList = vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([zone]);
		const { cloudflareWorkers } = makeClient({}, zonesList);
		await cloudflareWorkers.upsertProxy(HOSTNAME, PROXY_CONFIG);
		expect(zonesList).toHaveBeenCalledTimes(2);
		expect(zonesList).toHaveBeenLastCalledWith({ name: "example.com" });
	});

	it("throws ProviderApiError when no zone is found anywhere up to the apex", async () => {
		const { cloudflareWorkers } = makeClient({}, vi.fn().mockResolvedValue([]));
		await expect(cloudflareWorkers.upsertProxy(HOSTNAME, PROXY_CONFIG)).rejects.toThrow(ProviderApiError);
	});

	it("caches the resolved zone id across calls", async () => {
		const zonesList = vi.fn().mockResolvedValue([zone]);
		const { cloudflareWorkers } = makeClient({}, zonesList);
		await cloudflareWorkers.upsertProxy(HOSTNAME, PROXY_CONFIG);
		await cloudflareWorkers.upsertProxy(HOSTNAME, PROXY_CONFIG);
		expect(zonesList).toHaveBeenCalledTimes(1);
	});
});

describe("CloudflareWorkers.deployScript", () => {
	it("deploys the given code and returns the script name", async () => {
		const { cloudflareWorkers, workers } = makeClient();
		const result = await cloudflareWorkers.deployScript("sentinel", { code: "export default { fetch() {} };" });

		expect(workers.putScript).toHaveBeenCalledWith(ACCOUNT, "sentinel", "export default { fetch() {} };");
		expect(result).toEqual({ scriptName: "sentinel" });
		expect(workers.putSecret).not.toHaveBeenCalled();
	});

	it("sets every secret in config.secrets", async () => {
		const { cloudflareWorkers, workers } = makeClient();
		await cloudflareWorkers.deployScript("sentinel", {
			code: "export default {};",
			secrets: { WEBHOOK_SECRET: "shh", APP_PRIVATE_KEY: "-----BEGIN..." },
		});

		expect(workers.putSecret).toHaveBeenCalledWith(ACCOUNT, "sentinel", "WEBHOOK_SECRET", "shh");
		expect(workers.putSecret).toHaveBeenCalledWith(ACCOUNT, "sentinel", "APP_PRIVATE_KEY", "-----BEGIN...");
		expect(workers.putSecret).toHaveBeenCalledTimes(2);
	});

	it("creates a route for each pattern in config.routes that doesn't already exist", async () => {
		const { cloudflareWorkers, workers } = makeClient({ listRoutes: vi.fn().mockResolvedValue([]) });
		await cloudflareWorkers.deployScript("sentinel", {
			code: "export default {};",
			routes: ["sentinel.example.com/*"],
		});

		expect(workers.createRoute).toHaveBeenCalledWith(ZONE_ID, "sentinel.example.com/*", "sentinel");
	});

	it("updates an existing route when its script name differs", async () => {
		const existing = { id: "route-9", pattern: "sentinel.example.com/*", script: "old" };
		const { cloudflareWorkers, workers } = makeClient({ listRoutes: vi.fn().mockResolvedValue([existing]) });
		await cloudflareWorkers.deployScript("sentinel", {
			code: "export default {};",
			routes: ["sentinel.example.com/*"],
		});

		expect(workers.updateRoute).toHaveBeenCalledWith(ZONE_ID, "route-9", "sentinel.example.com/*", "sentinel");
	});

	it("wires no routes when config.routes is omitted", async () => {
		const { cloudflareWorkers, workers } = makeClient();
		await cloudflareWorkers.deployScript("sentinel", { code: "export default {};" });
		expect(workers.listRoutes).not.toHaveBeenCalled();
		expect(workers.createRoute).not.toHaveBeenCalled();
	});
});
