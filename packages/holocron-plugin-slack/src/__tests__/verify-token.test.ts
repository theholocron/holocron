import { describe, expect, it } from "vitest";

import { verifyToken } from "../verify-token.js";
import { stubFetch } from "./helpers.js";

const BASE = "https://slack.test/api";

describe("verifyToken", () => {
	it("returns ok:true with user@team on success", async () => {
		const { fetch } = stubFetch([{ body: { ok: true, user: "newton", team: "theholocron" } }]);
		const result = await verifyToken("xoxb-test", { baseUrl: BASE, fetch });
		expect(result).toMatchObject({ ok: true, subject: "newton @ theholocron" });
	});

	it("returns ok:false on Slack API error", async () => {
		const { fetch } = stubFetch([{ body: { ok: false, error: "invalid_auth" } }]);
		const result = await verifyToken("xoxb-bad", { baseUrl: BASE, fetch });
		expect(result.ok).toBe(false);
	});
});
