import { describe, expect, it } from "vitest";

import { verifyToken } from "../verify-token.js";
import { cfOk, stubFetch } from "./helpers.js";

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
		expect(result).toMatchObject({ ok: true, subject: "zone: theholocron.dev" });
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
