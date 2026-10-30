import { ProviderApiError } from "@theholocron/cli";
import { stubFetch } from "@theholocron/http-client/testing";
import { describe, expect, it } from "vitest";

import { cfOk } from "../helpers.js";
import { createCloudflareClient } from "../rest.js";
import { CloudflareDns } from "./dns.js";

const BASE = "https://cf.test/client/v4";
const ZONE_ID = "zone-abc";
const ZONE_NAME = "example.com";

function makeDns(responses: Parameters<typeof stubFetch>[0]) {
	const { fetch, calls } = stubFetch(responses);
	const client = createCloudflareClient({ token: "cf-tok", baseUrl: BASE, fetch, retryDelayMs: 0 });
	return { dns: new CloudflareDns(() => client), calls };
}

const zone = { id: ZONE_ID, name: ZONE_NAME, status: "active" };
const record = { id: "rec-1", type: "CNAME", name: "www", content: "example.com", ttl: 1, proxied: false };

describe("CloudflareDns.listRecords", () => {
	it("resolves zone then lists records", async () => {
		const { dns, calls } = makeDns([cfOk([zone]), cfOk([record])]);
		const result = await dns.listRecords(ZONE_NAME);
		expect(calls[0]?.url).toContain(`/zones?`);
		expect(calls[0]?.url).toContain(`name=${ZONE_NAME}`);
		expect(calls[1]?.url).toContain(`/zones/${ZONE_ID}/dns_records`);
		expect(result[0]?.id).toBe("rec-1");
	});

	it("caches the zone id on subsequent calls", async () => {
		const { dns, calls } = makeDns([cfOk([zone]), cfOk([record]), cfOk([record])]);
		await dns.listRecords(ZONE_NAME);
		await dns.listRecords(ZONE_NAME);
		// Zone lookup fires only once
		const zoneLookups = calls.filter((c) => c.url.includes("/zones?"));
		expect(zoneLookups).toHaveLength(1);
	});

	it("throws ProviderApiError when zone is not found", async () => {
		const { dns } = makeDns([cfOk([])]);
		await expect(dns.listRecords("absent.example")).rejects.toBeInstanceOf(ProviderApiError);
	});
});

describe("CloudflareDns.upsertRecord — create path", () => {
	it("creates when no existing record matches type+name", async () => {
		const { dns, calls } = makeDns([
			cfOk([zone]), // zone lookup
			cfOk([]), // list — no match
			cfOk(record), // create
		]);
		await dns.upsertRecord(ZONE_NAME, { type: "CNAME", name: "www", content: "other.com" });
		expect(calls[2]?.method).toBe("POST");
		expect(calls[2]?.url).toContain(`/zones/${ZONE_ID}/dns_records`);
	});

	it("includes ttl in create body when provided", async () => {
		const { dns, calls } = makeDns([cfOk([zone]), cfOk([]), cfOk(record)]);
		await dns.upsertRecord(ZONE_NAME, { type: "A", name: "api", content: "1.2.3.4", ttl: 300 });
		expect(calls[2]?.body).toMatchObject({ ttl: 300 });
	});

	it("includes proxied in create body when provided", async () => {
		const { dns, calls } = makeDns([cfOk([zone]), cfOk([]), cfOk(record)]);
		await dns.upsertRecord(ZONE_NAME, {
			type: "CNAME",
			name: "wiki",
			content: "org.docs.buildwithfern.com",
			proxied: true,
		});
		expect(calls[2]?.body).toMatchObject({ proxied: true });
	});
});

describe("CloudflareDns.upsertRecord — update path", () => {
	it("patches the first matching record", async () => {
		const { dns, calls } = makeDns([
			cfOk([zone]), // zone lookup
			cfOk([record]), // list — match found
			cfOk({ ...record, content: "new.example.com" }), // update
		]);
		await dns.upsertRecord(ZONE_NAME, { type: "CNAME", name: "www", content: "new.example.com" });
		expect(calls[2]?.method).toBe("PATCH");
		expect(calls[2]?.url).toContain(`/zones/${ZONE_ID}/dns_records/${record.id}`);
	});

	it("includes ttl in patch body when provided", async () => {
		const { dns, calls } = makeDns([cfOk([zone]), cfOk([record]), cfOk(record)]);
		await dns.upsertRecord(ZONE_NAME, { type: "CNAME", name: "www", content: "new.com", ttl: 60 });
		expect(calls[2]?.body).toMatchObject({ ttl: 60 });
	});

	it("includes proxied in patch body when provided", async () => {
		const { dns, calls } = makeDns([cfOk([zone]), cfOk([record]), cfOk(record)]);
		await dns.upsertRecord(ZONE_NAME, { type: "CNAME", name: "www", content: "new.com", proxied: true });
		expect(calls[2]?.body).toMatchObject({ proxied: true });
	});
});

describe("CloudflareDns.upsertRecord — a transient Cloudflare failure (#1398)", () => {
	const unavailable = (status = 500) => ({ status, text: "internal error" });
	const wanted = { type: "CNAME" as const, name: "preview", content: "pages.example.dev" };

	it("creates the record after the list of existing records answered 500 once", async () => {
		const { dns, calls } = makeDns([
			cfOk([zone]), // zone lookup
			unavailable(), // list — the failure repo setup hit
			cfOk([]), // list again — no match
			cfOk(record), // create
		]);
		const result = await dns.upsertRecord(ZONE_NAME, wanted);
		expect(result.id).toBe("rec-1");
		expect(calls.map((c) => c.method)).toEqual(["GET", "GET", "GET", "POST"]);
		expect(calls[2]?.url).toBe(calls[1]?.url);
	});

	it("updates the record after the list answered 503 once", async () => {
		const { dns, calls } = makeDns([cfOk([zone]), unavailable(503), cfOk([record]), cfOk(record)]);
		await dns.upsertRecord(ZONE_NAME, wanted);
		expect(calls.map((c) => c.method)).toEqual(["GET", "GET", "GET", "PATCH"]);
	});

	it("looks the zone up again when that answered 502 once", async () => {
		const { dns, calls } = makeDns([unavailable(502), cfOk([zone]), cfOk([]), cfOk(record)]);
		await dns.upsertRecord(ZONE_NAME, wanted);
		expect(calls.map((c) => c.method)).toEqual(["GET", "GET", "GET", "POST"]);
	});

	it("fails with the last status and how many sends it took, and writes nothing, when the list keeps failing", async () => {
		const { dns, calls } = makeDns([cfOk([zone]), unavailable(), unavailable(), unavailable()]);
		const err = await dns.upsertRecord(ZONE_NAME, wanted).catch((e: unknown) => e);
		expect(err).toBeInstanceOf(ProviderApiError);
		expect((err as ProviderApiError).status).toBe(500);
		expect((err as Error).message).toBe(`Cloudflare GET /zones/${ZONE_ID}/dns_records → 500 (after 3 attempts)`);
		expect(calls.map((c) => c.method)).toEqual(["GET", "GET", "GET", "GET"]);
	});

	it("does not send the create again when it answered 503", async () => {
		const { dns, calls } = makeDns([cfOk([zone]), cfOk([]), unavailable(503)]);
		const err = await dns.upsertRecord(ZONE_NAME, wanted).catch((e: unknown) => e);
		expect((err as ProviderApiError).status).toBe(503);
		expect(calls.map((c) => c.method)).toEqual(["GET", "GET", "POST"]);
	});
});

describe("CloudflareDns.whoami", () => {
	it("reports ok and the zone count — no specific domain needed", async () => {
		const { dns, calls } = makeDns([cfOk([zone, { ...zone, id: "zone-def", name: "other.com" }])]);
		const result = await dns.whoami();
		expect(result).toEqual({ ok: true, zones: 2 });
		expect(calls[0]?.url).toContain("/zones");
	});

	it("propagates a token/API error instead of swallowing it", async () => {
		const { dns } = makeDns([{ status: 403, body: { success: false, errors: [], result: null } }]);
		await expect(dns.whoami()).rejects.toBeInstanceOf(ProviderApiError);
	});
});

describe("CloudflareDns.deleteRecord", () => {
	it("resolves zone then DELETEs the record", async () => {
		const { dns, calls } = makeDns([cfOk([zone]), cfOk({ id: "rec-1" })]);
		await dns.deleteRecord(ZONE_NAME, "rec-1");
		expect(calls[1]?.method).toBe("DELETE");
		expect(calls[1]?.url).toContain(`/zones/${ZONE_ID}/dns_records/rec-1`);
	});
});
