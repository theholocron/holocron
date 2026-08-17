import { describe, expect, it } from "vitest";

import { createCloudflareClient } from "../index.js";
import { cfOk, stubFetch } from "./helpers.js";

const BASE = "https://cf.test/client/v4";

function client(responses: Parameters<typeof stubFetch>[0]) {
	const { fetch, calls } = stubFetch(responses);
	return { tokens: createCloudflareClient({ token: "tok", baseUrl: BASE, fetch }).tokens, calls };
}

describe("tokens.verify", () => {
	it("GETs /user/tokens/verify and returns status", async () => {
		const { tokens, calls } = client([cfOk({ id: "tok-123", status: "active" })]);
		const result = await tokens.verify();
		expect(calls[0]?.url).toContain(`${BASE}/user/tokens/verify`);
		expect(result).toEqual({ id: "tok-123", status: "active" });
	});
});
