import { describe, expect, it } from "vitest";

import { verifyToken } from "../verify-token.js";
import { stubFetch } from "./helpers.js";

describe("verifyToken", () => {
	it("returns ok with user email when /v1/users/me returns 200 with a user record", async () => {
		const stub = stubFetch([{ status: 200, body: { user: { email: "cnewton@example.com" } } }]);
		const result = await verifyToken("token", { fetch: stub.fetch });
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.subject).toMatch(/cnewton@example.com/);
		}
		expect(stub.calls[0]?.url).toMatch(/\/v1\/users\/me/);
	});

	it("falls back to identity name for machine-identity tokens", async () => {
		const stub = stubFetch([{ status: 200, body: { identity: { name: "ci-bot", id: "id-1" } } }]);
		const result = await verifyToken("machine-token", { fetch: stub.fetch });
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.subject).toMatch(/ci-bot/);
		}
	});

	it("returns ok:false on 401", async () => {
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
});
