import { ProviderApiError } from "@theholocron/http-client";
import { describe, expect, it } from "vitest";

import { createCloudflareClient } from "../index.js";
import { cfOk, stubFetch } from "../test-helpers.js";

const BASE = "https://cf.test/client/v4";
const ZONE = "zone-abc";

function client(responses: Parameters<typeof stubFetch>[0], retries?: number) {
	const { fetch, calls } = stubFetch(responses);
	return {
		dns: createCloudflareClient({ token: "tok", baseUrl: BASE, fetch, retryDelayMs: 0, retries }).dns,
		calls,
	};
}

const record = {
	id: "rec-1",
	type: "CNAME" as const,
	name: "www",
	content: "example.com",
	ttl: 1,
	proxied: false,
};

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
		await dns.create(ZONE, {
			type: "CNAME",
			name: "www",
			content: "example.com",
		});
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
		await dns.create(ZONE, {
			type: "A",
			name: "api",
			content: "1.2.3.4",
			ttl: 300,
			proxied: true,
		});
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

describe("a transient Cloudflare failure", () => {
	const unavailable = (status: number, text = "boom") => ({ status, text });

	it("is retried for a read, which then succeeds (the repo setup failure in #1398)", async () => {
		const { dns, calls } = client([unavailable(500), cfOk([record])]);
		await expect(dns.list(ZONE, { type: "CNAME", name: "www" })).resolves.toEqual([record]);
		expect(calls).toHaveLength(2);
		expect(calls[1]?.method).toBe("GET");
		expect(calls[1]?.url).toBe(calls[0]?.url);
	});

	it("is retried for each of 500, 502, 503 and 504", async () => {
		for (const status of [500, 502, 503, 504]) {
			const { dns, calls } = client([unavailable(status), cfOk([record])]);
			await dns.list(ZONE);
			expect(calls).toHaveLength(2);
		}
	});

	it("fails after three sends with the last status, the body and the number of sends", async () => {
		const { dns, calls } = client([unavailable(500, "one"), unavailable(500, "two"), unavailable(500, "three")]);
		const err = await dns.list(ZONE).catch((e: unknown) => e);
		expect(err).toBeInstanceOf(ProviderApiError);
		expect((err as ProviderApiError).status).toBe(500);
		expect((err as ProviderApiError).details).toBe("three");
		expect((err as Error).message).toBe(`Cloudflare GET /zones/${ZONE}/dns_records → 500 (after 3 attempts)`);
		expect(calls).toHaveLength(3);
	});

	it("is not retried for a status that is not transient", async () => {
		for (const status of [400, 403, 404, 429]) {
			const { dns, calls } = client([unavailable(status)]);
			const err = await dns.list(ZONE).catch((e: unknown) => e);
			expect((err as ProviderApiError).status).toBe(status);
			expect(calls).toHaveLength(1);
		}
	});

	it("is never repeated for a write, which may have been applied", async () => {
		const write = { type: "A" as const, name: "api", content: "1.2.3.4" };
		const created = client([unavailable(503)]);
		await expect(created.dns.create(ZONE, write)).rejects.toBeInstanceOf(ProviderApiError);
		expect(created.calls).toHaveLength(1);
		const updated = client([unavailable(503)]);
		await expect(updated.dns.update(ZONE, "rec-1", { content: "5.6.7.8" })).rejects.toBeInstanceOf(
			ProviderApiError
		);
		expect(updated.calls).toHaveLength(1);
		const deleted = client([unavailable(503)]);
		await expect(deleted.dns.delete(ZONE, "rec-1")).rejects.toBeInstanceOf(ProviderApiError);
		expect(deleted.calls).toHaveLength(1);
	});

	it("is not retried when retries is 0", async () => {
		const { dns, calls } = client([unavailable(500), cfOk([record])], 0);
		await expect(dns.list(ZONE)).rejects.toBeInstanceOf(ProviderApiError);
		expect(calls).toHaveLength(1);
	});
});
