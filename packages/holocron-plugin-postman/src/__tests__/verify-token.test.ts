import { describe, expect, it } from "vitest";

import { verifyToken } from "../verify-token.js";
import { stubFetch } from "./helpers.js";

describe("verifyToken", () => {
	it("returns ok with the user email when /me returns 200", async () => {
		const stub = stubFetch([
			{ status: 200, body: { user: { id: 42, email: "c@example.com", username: "cnewton" } } },
		]);
		const result = await verifyToken("PMAK-abc", { fetch: stub.fetch });
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.subject).toMatch(/user @ c@example.com/);
		}
		expect(stub.calls[0]?.url).toMatch(/\/me/);
	});

	it("falls back to username when email is absent", async () => {
		const stub = stubFetch([{ status: 200, body: { user: { id: 42, username: "cnewton" } } }]);
		const result = await verifyToken("PMAK-abc", { fetch: stub.fetch });
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.subject).toMatch(/user @ cnewton/);
		}
	});

	it("falls back to id when username + email + fullName are absent", async () => {
		const stub = stubFetch([{ status: 200, body: { user: { id: 42 } } }]);
		const result = await verifyToken("PMAK-abc", { fetch: stub.fetch });
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.subject).toMatch(/user @ 42/);
		}
	});

	it("falls back to 'unknown' when the user body is empty", async () => {
		const stub = stubFetch([{ status: 200, body: { user: {} } }]);
		const result = await verifyToken("PMAK-abc", { fetch: stub.fetch });
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.subject).toMatch(/user @ unknown/);
		}
	});

	it("returns ok:false with the error message on 401", async () => {
		const stub = stubFetch([{ status: 401, body: { error: { name: "AuthenticationError" } } }]);
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
		const stub = stubFetch([{ status: 200, body: { user: { email: "x@y.com" } } }]);
		await verifyToken("t", { fetch: stub.fetch, baseUrl: "https://api.postman.example" });
		expect(stub.calls[0]?.url).toMatch(/^https:\/\/api\.postman\.example\/me/);
	});
});
