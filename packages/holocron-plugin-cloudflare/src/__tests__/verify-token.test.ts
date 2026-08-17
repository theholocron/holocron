import { describe, expect, it } from "vitest";

import { verifyToken } from "../verify-token.js";
import { cfOk, stubFetch } from "./helpers.js";

const BASE = "https://cf.test/client/v4";

describe("verifyToken", () => {
	it("returns ok:true with token id and status on success", async () => {
		const { fetch } = stubFetch([cfOk({ id: "tok-123", status: "active" })]);
		const result = await verifyToken("cf-token", { baseUrl: BASE, fetch });
		expect(result).toMatchObject({ ok: true, subject: expect.stringContaining("tok-123") });
	});

	it("returns ok:false when the API rejects the token", async () => {
		const { fetch } = stubFetch([{ status: 401, body: { errors: ["Invalid token"] } }]);
		const result = await verifyToken("bad-token", { baseUrl: BASE, fetch });
		expect(result.ok).toBe(false);
	});
});
