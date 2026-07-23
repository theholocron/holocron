import { describe, expect, it } from "vitest";

import { verifyToken } from "../verify-token.js";
import { stubFetch } from "./helpers.js";

describe("verifyToken", () => {
	it("returns ok with env + id when /instance returns 200", async () => {
		const stub = stubFetch([{ status: 200, body: { id: "ins_abc123", environment_type: "development" } }]);
		const result = await verifyToken("sk_test_abc", { fetch: stub.fetch });
		expect(result.ok).toBe(true);
		expect((result as { ok: boolean; subject?: string; message?: string }).subject).toMatch(
			/development instance ins_abc123/
		);
	});

	it("hits /instance without doubling the /v1 base-URL prefix", async () => {
		const stub = stubFetch([{ status: 200, body: { id: "ins_1", environment_type: "production" } }]);
		await verifyToken("sk_live", { fetch: stub.fetch });
		// Default base URL is https://api.clerk.com/v1 — path must NOT
		// start with /v1 or the final URL becomes …/v1/v1/instance.
		expect(stub.calls[0]?.url).toBe("https://api.clerk.com/v1/instance");
	});

	it("falls back to 'unknown' when instance metadata is missing", async () => {
		const stub = stubFetch([{ status: 200, body: {} }]);
		const result = await verifyToken("sk_test", { fetch: stub.fetch });
		expect(result.ok).toBe(true);
		expect((result as { ok: boolean; subject?: string; message?: string }).subject).toMatch(
			/unknown instance unknown/
		);
	});

	it("returns ok:false with the error message on 401", async () => {
		const stub = stubFetch([{ status: 401, body: { errors: [{ message: "invalid" }] } }]);
		const result = await verifyToken("bad", { fetch: stub.fetch });
		expect(result.ok).toBe(false);
		expect((result as { ok: boolean; subject?: string; message?: string }).message).toMatch(/→ 401/);
	});

	it("returns ok:false when the network layer throws", async () => {
		const throwing: typeof fetch = async () => {
			throw new TypeError("network down");
		};
		const result = await verifyToken("t", { fetch: throwing });
		expect(result.ok).toBe(false);
		expect((result as { ok: boolean; subject?: string; message?: string }).message).toMatch(/network down/);
	});

	it("returns ok:false when a non-Error value is thrown (String(err) branch)", async () => {
		// The HTTP client wraps fetch throws into ProviderApiError (always an Error),
		// so the `String(err)` branch in the catch is unreachable via the network layer.
		// Inject a mock client that throws a plain string to cover it directly.
		const { vi } = await import("vitest");
		const restModule = await import("../rest.js");
		const mockFactory = vi.spyOn(restModule, "createClerkClient").mockReturnValue({
			instance: { get: async () => { throw "non-error string"; } },
		} as unknown as ReturnType<typeof restModule.createClerkClient>);
		try {
			const result = await verifyToken("t", {});
			expect(result.ok).toBe(false);
			expect((result as { message?: string }).message).toBe("non-error string");
		} finally {
			mockFactory.mockRestore();
		}
	});

	it("hits the configured base URL", async () => {
		const stub = stubFetch([{ status: 200, body: { id: "ins", environment_type: "staging" } }]);
		await verifyToken("t", { fetch: stub.fetch, baseUrl: "https://api.clerk.example/v1" });
		expect(stub.calls[0]?.url).toMatch(/^https:\/\/api\.clerk\.example\/v1\/instance/);
	});
});
