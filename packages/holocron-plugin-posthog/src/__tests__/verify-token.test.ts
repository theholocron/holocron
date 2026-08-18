import { describe, expect, it } from "vitest";

import { verifyToken } from "../verify-token.js";
import { stubFetch } from "./helpers.js";

const BASE = "https://posthog.test";

describe("verifyToken", () => {
	it("returns ok:true with email@org on success", async () => {
		const { fetch } = stubFetch([
			{ body: { email: "newton@example.com", organization: { slug: "theholocron", name: "The Holocron" } } },
		]);
		const result = await verifyToken("phx_test", { baseUrl: BASE, fetch });
		expect(result).toMatchObject({ ok: true, subject: "newton@example.com @ theholocron" });
	});

	it("returns ok:false on 401", async () => {
		const { fetch } = stubFetch([{ status: 401, body: { detail: "Authentication credentials were not provided." } }]);
		const result = await verifyToken("phx_bad", { baseUrl: BASE, fetch });
		expect(result.ok).toBe(false);
	});
});
