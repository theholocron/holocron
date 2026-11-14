import { describe, expect, it } from "vitest";

import { createCloudflareClient } from "../index.js";
import { cfOk, stubFetch } from "../test-helpers.js";

const BASE = "https://cf.test/client/v4";

function client(responses: Parameters<typeof stubFetch>[0]) {
	const { fetch, calls } = stubFetch(responses);
	return {
		tokens: createCloudflareClient({ token: "tok", baseUrl: BASE, fetch }).tokens,
		calls,
	};
}

describe("tokens.verify", () => {
	it("GETs /user/tokens/verify and returns status", async () => {
		const { tokens, calls } = client([cfOk({ id: "tok-123", status: "active" })]);
		const result = await tokens.verify();
		expect(calls[0]?.url).toContain(`${BASE}/user/tokens/verify`);
		expect(result).toEqual({ id: "tok-123", status: "active" });
	});

	it("returns the expiry and start of validity when Cloudflare gives them", async () => {
		const body = {
			id: "tok-1",
			status: "active",
			expires_on: "2027-01-01T00:00:00Z",
			not_before: "2026-10-01T00:00:00Z",
		};
		const { tokens } = client([cfOk(body)]);
		expect(await tokens.verify()).toEqual(body);
	});
});
