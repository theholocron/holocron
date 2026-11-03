import { stubFetch } from "@theholocron/http-client/testing";
import { describe, expect, it } from "vitest";

import { cfOk } from "../helpers.js";
import { createCloudflareClient } from "../rest.js";
import { CloudflareTunnels } from "./tunnels.js";

const BASE = "https://cf.test/client/v4";
const ACCOUNT = "acct-123";
const ROUTE = { name: "sentinel-dev", hostname: "sentinel-dev.example.dev", service: "http://localhost:3000" };
const CATCH_ALL = { service: "http_status:404" };

function makeTunnels(responses: Parameters<typeof stubFetch>[0]) {
	const { fetch, calls } = stubFetch(responses);
	const client = createCloudflareClient({ token: "cf-tok", baseUrl: BASE, fetch, retryDelayMs: 0 });
	return { tunnels: new CloudflareTunnels(() => client, ACCOUNT), calls };
}

const tunnel = { id: "tun-1", name: "sentinel-dev" };
const config = (ingress: unknown[]) => cfOk({ config: { ingress } });

describe("CloudflareTunnels.ensureTunnel", () => {
	it("makes the tunnel and its route when there is neither", async () => {
		const { tunnels, calls } = makeTunnels([cfOk([]), cfOk(tunnel), config([]), cfOk({})]);
		const result = await tunnels.ensureTunnel(ROUTE);

		expect(result).toEqual({
			id: "tun-1",
			name: "sentinel-dev",
			created: true,
			configured: true,
			target: "tun-1.cfargotunnel.com",
		});
		expect(calls[1]?.method).toBe("POST");
		expect(calls[1]?.url).toContain(`/accounts/${ACCOUNT}/cfd_tunnel`);
		expect(calls[3]?.method).toBe("PUT");
		expect(calls[3]?.url).toContain("/cfd_tunnel/tun-1/configurations");
		expect(calls[3]?.body).toEqual({
			config: { ingress: [{ hostname: ROUTE.hostname, service: ROUTE.service }, CATCH_ALL] },
		});
	});

	it("finds a tunnel by name and changes nothing when it already serves the hostname", async () => {
		const ingress = [{ hostname: ROUTE.hostname, service: ROUTE.service }, CATCH_ALL];
		const { tunnels, calls } = makeTunnels([cfOk([{ id: "other", name: "x" }, tunnel]), config(ingress)]);
		const result = await tunnels.ensureTunnel(ROUTE);

		expect(result).toMatchObject({ id: "tun-1", created: false, configured: false });
		expect(calls).toHaveLength(2);
	});

	it("points the hostname at a new service and keeps the other hostnames and the catch-all", async () => {
		const other = { hostname: "other.example.dev", service: "http://localhost:9" };
		const current = [other, { hostname: ROUTE.hostname, service: "http://localhost:1" }, CATCH_ALL];
		const { tunnels, calls } = makeTunnels([cfOk([tunnel]), config(current), cfOk({})]);
		const result = await tunnels.ensureTunnel(ROUTE);

		expect(result).toMatchObject({ created: false, configured: true });
		expect(calls[2]?.body).toEqual({
			config: { ingress: [other, { hostname: ROUTE.hostname, service: ROUTE.service }, CATCH_ALL] },
		});
	});

	it("adds the hostname after the others, and keeps a catch-all that is not the default", async () => {
		const other = { hostname: "other.example.dev", service: "http://localhost:9" };
		const fallback = { service: "http_status:503" };
		const { tunnels, calls } = makeTunnels([cfOk([tunnel]), config([other, fallback]), cfOk({})]);
		await tunnels.ensureTunnel(ROUTE);

		expect(calls[2]?.body).toEqual({
			config: { ingress: [other, { hostname: ROUTE.hostname, service: ROUTE.service }, fallback] },
		});
	});

	it("treats a tunnel with no configuration yet as having no routes", async () => {
		const { tunnels, calls } = makeTunnels([cfOk([tunnel]), cfOk({ config: null }), cfOk({})]);
		await tunnels.ensureTunnel(ROUTE);

		expect(calls[2]?.body).toEqual({
			config: { ingress: [{ hostname: ROUTE.hostname, service: ROUTE.service }, CATCH_ALL] },
		});
	});
});

describe("CloudflareTunnels.tunnelToken", () => {
	it("returns the connector token", async () => {
		const { tunnels, calls } = makeTunnels([cfOk("TOKEN")]);
		expect(await tunnels.tunnelToken("tun-1")).toBe("TOKEN");
		expect(calls[0]?.url).toContain(`/accounts/${ACCOUNT}/cfd_tunnel/tun-1/token`);
	});
});

describe("CloudflareTunnels.whoami", () => {
	it("counts the tunnels the token can see", async () => {
		const { tunnels } = makeTunnels([cfOk([tunnel, { id: "t2", name: "b" }])]);
		expect(await tunnels.whoami()).toEqual({ ok: true, tunnels: 2 });
	});
});
