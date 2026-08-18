import { describe, expect, it } from "vitest";

import { verifyToken } from "../verify-token.js";
import { stubFetch } from "./helpers.js";

const BASE = "https://discord.test/api/v10";
const WEBHOOK_URL = "https://discord.com/api/webhooks/111/abc123";

describe("verifyToken", () => {
	it("returns ok:true with webhook name and id on success", async () => {
		const { fetch } = stubFetch([{ status: 200, body: { id: "111", name: "deploy-alerts" } }]);
		const result = await verifyToken(WEBHOOK_URL, { baseUrl: BASE, fetch });
		expect(result).toMatchObject({ ok: true, subject: expect.stringContaining("deploy-alerts") });
	});

	it("returns ok:false when webhook is not found", async () => {
		const { fetch } = stubFetch([{ status: 404, body: {} }]);
		const result = await verifyToken(WEBHOOK_URL, { baseUrl: BASE, fetch });
		expect(result.ok).toBe(false);
	});

	it("returns ok:false for an invalid webhook URL", async () => {
		const result = await verifyToken("not-a-url");
		expect(result).toMatchObject({ ok: false, message: expect.stringContaining("Invalid Discord webhook URL") });
	});
});
