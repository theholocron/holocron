import { describe, expect, it } from "vitest";

import { verifyToken } from "../verify-token.js";
import { stubFetch } from "./helpers.js";

describe("verifyToken", () => {
	it("returns ok with the login when /user returns 200", async () => {
		const stub = stubFetch([{ status: 200, body: { login: "cnewton", email: "c@example.com" } }]);
		const result = await verifyToken("pat-abc", { fetch: stub.fetch });
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.subject).toMatch(/user @ cnewton/);
		}
	});

	it("falls back to email when login is absent", async () => {
		const stub = stubFetch([{ status: 200, body: { email: "c@example.com" } }]);
		const result = await verifyToken("pat-abc", { fetch: stub.fetch });
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.subject).toMatch(/c@example.com/);
		}
	});

	it("returns ok:false with the error message on 401", async () => {
		const stub = stubFetch([{ status: 401, body: { message: "Bad credentials" } }]);
		const result = await verifyToken("bad", { fetch: stub.fetch });
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.message).toMatch(/→ 401/);
		}
	});

	it("returns ok:false when the network layer throws", async () => {
		const throwing: typeof fetch = async () => {
			throw new TypeError("network down");
		};
		const result = await verifyToken("anything", { fetch: throwing });
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.message).toMatch(/network down/);
		}
	});

	it("hits the configured base URL", async () => {
		const stub = stubFetch([{ status: 200, body: { login: "x" } }]);
		await verifyToken("t", { fetch: stub.fetch, baseUrl: "https://ghe.example.com/api/v3" });
		expect(stub.calls[0]?.url).toMatch(/^https:\/\/ghe\.example\.com\/api\/v3\/user/);
	});
});
