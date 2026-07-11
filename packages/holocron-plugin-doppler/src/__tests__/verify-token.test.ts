import { describe, expect, it } from "vitest";

import { verifyToken } from "../verify-token.js";
import { stubFetch } from "./helpers.js";

describe("verifyToken", () => {
	it("returns ok with a subject when /v3/me returns 200", async () => {
		const stub = stubFetch([{ status: 200, body: { type: "personal", workplace: { name: "acme" } } }]);
		const result = await verifyToken("dp.pt.abc", { fetch: stub.fetch });
		expect(result.ok).toBe(true);
		expect((result as { ok: boolean; subject?: string; message?: string }).subject).toMatch(/personal @ acme/);
	});

	it("falls back to slug when workplace.name is absent", async () => {
		const stub = stubFetch([{ status: 200, body: { type: "cli", slug: "cnewton" } }]);
		const result = await verifyToken("dp.ct.xyz", { fetch: stub.fetch });
		expect(result.ok).toBe(true);
		expect((result as { ok: boolean; subject?: string; message?: string }).subject).toMatch(/cli @ cnewton/);
	});

	it("returns ok:false with the error message on 401", async () => {
		const stub = stubFetch([{ status: 401, body: { messages: ["Invalid API token"] } }]);
		const result = await verifyToken("bad", { fetch: stub.fetch });
		expect(result.ok).toBe(false);
		expect((result as { ok: boolean; subject?: string; message?: string }).message).toMatch(/→ 401/);
	});

	it("returns ok:false when the network layer throws", async () => {
		const throwing: typeof fetch = async () => {
			throw new TypeError("network down");
		};
		const result = await verifyToken("anything", { fetch: throwing });
		expect(result.ok).toBe(false);
		expect((result as { ok: boolean; subject?: string; message?: string }).message).toMatch(/network down/);
	});

	it("hits the configured base URL", async () => {
		const stub = stubFetch([{ status: 200, body: { workplace: { name: "x" } } }]);
		await verifyToken("t", { fetch: stub.fetch, baseUrl: "https://custom.example.com/v3" });
		expect(stub.calls[0]?.url).toMatch(/^https:\/\/custom\.example\.com\/v3\/me/);
	});
});
