import { describe, expect, it } from "vitest";

import { createCloudflareClient } from "../index.js";
import { cfOk, stubFetch } from "./helpers.js";

const BASE = "https://cf.test/client/v4";
const ZONE = "zone-abc";

function client(responses: Parameters<typeof stubFetch>[0]) {
	const { fetch, calls } = stubFetch(responses);
	return { dns: createCloudflareClient({ token: "tok", baseUrl: BASE, fetch }).dns, calls };
}

const record = { id: "rec-1", type: "CNAME" as const, name: "www", content: "example.com", ttl: 1, proxied: false };

describe("dns.list", () => {
	it("GETs /zones/{zoneId}/dns_records", async () => {
		const { dns, calls } = client([cfOk([record])]);
		await dns.list(ZONE);
		expect(calls[0]?.url).toContain(`/zones/${ZONE}/dns_records`);
		expect(calls[0]?.url).toContain("per_page=100");
	});

	it("filters by type and name when provided", async () => {
		const { dns, calls } = client([cfOk([record])]);
		await dns.list(ZONE, { type: "TXT", name: "example.com" });
		expect(calls[0]?.url).toContain("type=TXT");
		expect(calls[0]?.url).toContain("name=example.com");
	});
});

describe("dns.create", () => {
	it("POSTs with defaults for ttl and proxied", async () => {
		const { dns, calls } = client([cfOk(record)]);
		await dns.create(ZONE, { type: "CNAME", name: "www", content: "example.com" });
		expect(calls[0]?.method).toBe("POST");
		expect(calls[0]?.body).toMatchObject({
			type: "CNAME",
			name: "www",
			content: "example.com",
			ttl: 1,
			proxied: false,
		});
	});

	it("passes explicit ttl and proxied", async () => {
		const { dns, calls } = client([cfOk(record)]);
		await dns.create(ZONE, { type: "A", name: "api", content: "1.2.3.4", ttl: 300, proxied: true });
		expect(calls[0]?.body).toMatchObject({ ttl: 300, proxied: true });
	});
});

describe("dns.update", () => {
	it("PATCHes the specific record", async () => {
		const { dns, calls } = client([cfOk({ ...record, content: "new.example.com" })]);
		await dns.update(ZONE, "rec-1", { content: "new.example.com" });
		expect(calls[0]?.method).toBe("PATCH");
		expect(calls[0]?.url).toContain(`/zones/${ZONE}/dns_records/rec-1`);
		expect(calls[0]?.body).toEqual({ content: "new.example.com" });
	});
});

describe("dns.delete", () => {
	it("DELETEs the specific record and returns id", async () => {
		const { dns, calls } = client([cfOk({ id: "rec-1" })]);
		const result = await dns.delete(ZONE, "rec-1");
		expect(calls[0]?.method).toBe("DELETE");
		expect(calls[0]?.url).toContain(`/zones/${ZONE}/dns_records/rec-1`);
		expect(result).toEqual({ id: "rec-1" });
	});
});
