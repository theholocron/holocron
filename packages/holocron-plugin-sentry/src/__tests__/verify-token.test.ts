import { describe, expect, it } from "vitest";

import { verifyToken } from "../verify-token.js";
import { stubFetch } from "./helpers.js";

const BASE = "https://sentry.test/api/0";

describe("verifyToken", () => {
	it("returns ok:true with org slug on success", async () => {
		const { fetch } = stubFetch([{ body: [{ id: "1", slug: "my-org", name: "My Org" }] }]);
		const result = await verifyToken("sntryu_tok", { baseUrl: BASE, fetch });
		expect(result).toMatchObject({ ok: true, subject: "org: my-org" });
	});

	it("returns ok:true with 'unknown' when no orgs returned", async () => {
		const { fetch } = stubFetch([{ body: [] }]);
		const result = await verifyToken("sntryu_tok", { baseUrl: BASE, fetch });
		expect(result).toMatchObject({ ok: true, subject: "org: unknown" });
	});

	it("returns ok:false when the API rejects the token", async () => {
		const { fetch } = stubFetch([
			{ status: 401, body: { detail: "Authentication credentials were not provided." } },
		]);
		const result = await verifyToken("bad-token", { baseUrl: BASE, fetch });
		expect(result.ok).toBe(false);
	});
});
