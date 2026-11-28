import { stubFetch } from "@theholocron/http-client/testing";
import { describe, expect, it } from "vitest";

import { cfOk } from "./helpers.js";
import { verifyToken } from "./verify-token.js";

const BASE = "https://cf.test/client/v4";

describe("verifyToken", () => {
	it("returns ok:true with token id and status when /user/tokens/verify succeeds", async () => {
		const { fetch } = stubFetch([cfOk({ id: "tok-123", status: "active" })]);
		const result = await verifyToken("cf-token", { baseUrl: BASE, fetch });
		expect(result).toMatchObject({ ok: true, subject: expect.stringContaining("tok-123") });
	});

	it("falls back to zone check when /user/tokens/verify returns 401", async () => {
		const { fetch } = stubFetch([
			{ status: 401, body: { success: false, errors: [{ code: 10000, message: "Authentication error" }] } },
			cfOk([{ id: "zone-1", name: "theholocron.dev", status: "active" }]),
		]);
		const result = await verifyToken("cf-token", { baseUrl: BASE, fetch });
		expect(result).toMatchObject({ ok: true, subject: "zones: theholocron.dev" });
	});

	it("lists every zone the token can see, not just the first one", async () => {
		const { fetch } = stubFetch([
			{ status: 401, body: { success: false, errors: [{ code: 10000, message: "Authentication error" }] } },
			cfOk([
				{ id: "zone-1", name: "theholocron.dev", status: "active" },
				{ id: "zone-2", name: "bethkoums.co", status: "active" },
			]),
		]);
		const result = await verifyToken("cf-token", { baseUrl: BASE, fetch });
		expect(result).toMatchObject({ ok: true, subject: "zones: theholocron.dev, bethkoums.co" });
	});

	it("truncates the zone list past 5 entries", async () => {
		const zones = Array.from({ length: 7 }, (_, i) => ({
			id: `zone-${i}`,
			name: `zone${i}.example.com`,
			status: "active",
		}));
		const { fetch } = stubFetch([
			{ status: 401, body: { success: false, errors: [{ code: 10000, message: "Authentication error" }] } },
			cfOk(zones),
		]);
		const result = await verifyToken("cf-token", { baseUrl: BASE, fetch });
		expect(result).toMatchObject({
			ok: true,
			subject:
				"zones: zone0.example.com, zone1.example.com, zone2.example.com, zone3.example.com, zone4.example.com (+2 more)",
		});
	});

	it("reports no zones visible when the list is empty", async () => {
		const { fetch } = stubFetch([
			{ status: 401, body: { success: false, errors: [{ code: 10000, message: "Authentication error" }] } },
			cfOk([]),
		]);
		const result = await verifyToken("cf-token", { baseUrl: BASE, fetch });
		expect(result).toMatchObject({ ok: true, subject: "no zones visible" });
	});

	it("returns ok:false when both /user/tokens/verify and zone check fail", async () => {
		const { fetch } = stubFetch([
			{ status: 401, body: { success: false, errors: [{ code: 10000, message: "Authentication error" }] } },
			{ status: 401, body: { success: false, errors: [{ code: 10000, message: "Authentication error" }] } },
		]);
		const result = await verifyToken("bad-token", { baseUrl: BASE, fetch });
		expect(result.ok).toBe(false);
	});
});
