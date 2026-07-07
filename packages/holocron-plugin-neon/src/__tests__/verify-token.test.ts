import { describe, expect, it } from "vitest";

import { verifyToken } from "../verify-token.js";
import { stubFetch } from "./helpers.js";

describe("verifyToken", () => {
	it("returns ok with the user email when /users/me returns 200", async () => {
		const stub = stubFetch([{ status: 200, body: { email: "c@example.com", login: "cnewton" } }]);
		const result = await verifyToken("pat-abc", { fetch: stub.fetch });
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.subject).toMatch(/user @ c@example.com/);
		}
		expect(stub.calls[0]?.url).toMatch(/\/users\/me/);
	});

	it("falls back to login when email is absent", async () => {
		const stub = stubFetch([{ status: 200, body: { login: "cnewton" } }]);
		const result = await verifyToken("pat-abc", { fetch: stub.fetch });
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.subject).toMatch(/user @ cnewton/);
		}
	});

	it("falls back to 'unknown' when the body is empty", async () => {
		const stub = stubFetch([{ status: 200, body: {} }]);
		const result = await verifyToken("pat-abc", { fetch: stub.fetch });
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.subject).toMatch(/user @ unknown/);
		}
	});

	it("returns ok:false with the error message on 401", async () => {
		const stub = stubFetch([{ status: 401, body: { message: "Unauthorized" } }]);
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
		const result = await verifyToken("t", { fetch: throwing });
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.message).toMatch(/network down/);
		}
	});

	it("hits the configured base URL", async () => {
		const stub = stubFetch([{ status: 200, body: { email: "x@y.com" } }]);
		await verifyToken("t", { fetch: stub.fetch, baseUrl: "https://console.neon.example/api/v2" });
		expect(stub.calls[0]?.url).toMatch(/^https:\/\/console\.neon\.example\/api\/v2\/users\/me/);
	});
});
