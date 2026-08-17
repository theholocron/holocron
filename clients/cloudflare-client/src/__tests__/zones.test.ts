import { describe, expect, it } from "vitest";

import { createCloudflareClient } from "../index.js";
import { cfOk, stubFetch } from "./helpers.js";

const BASE = "https://cf.test/client/v4";

function client(responses: Parameters<typeof stubFetch>[0]) {
	const { fetch, calls } = stubFetch(responses);
	return { zones: createCloudflareClient({ token: "tok", baseUrl: BASE, fetch }).zones, calls };
}

describe("zones.list", () => {
	it("GETs /zones with per_page=100 by default", async () => {
		const { zones, calls } = client([cfOk([])]);
		await zones.list();
		expect(calls[0]?.url).toContain(`${BASE}/zones`);
		expect(calls[0]?.url).toContain("per_page=100");
	});

	it("filters by name when provided", async () => {
		const { zones, calls } = client([cfOk([])]);
		await zones.list({ name: "example.com" });
		expect(calls[0]?.url).toContain("name=example.com");
	});

	it("returns mapped zones", async () => {
		const { zones } = client([cfOk([{ id: "zone-1", name: "example.com", status: "active" }])]);
		const result = await zones.list({ name: "example.com" });
		expect(result).toEqual([{ id: "zone-1", name: "example.com", status: "active" }]);
	});
});
