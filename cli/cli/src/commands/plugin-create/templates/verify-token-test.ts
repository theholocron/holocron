import type { TemplateInputs } from "../template-inputs/index.js";

export function render(_inputs: TemplateInputs): string {
	return `import { stubFetch } from "@theholocron/http-client/testing";
import { describe, expect, it } from "vitest";

import { verifyToken } from "./verify-token.js";

describe("verifyToken", () => {
	it("returns ok with a subject when /me returns 200", async () => {
		const stub = stubFetch([{ status: 200, body: { email: "user@example.com" } }]);
		const result = await verifyToken("token", { fetch: stub.fetch });
		expect(result.ok).toBe(true);
		expect((result as { ok: boolean; subject?: string }).subject).toMatch(/user@example.com/);
	});

	it("falls back to name, then id, then a placeholder for the subject", async () => {
		const named = stubFetch([{ status: 200, body: { name: "Ada" } }]);
		expect(await verifyToken("t", { fetch: named.fetch })).toEqual({ ok: true, subject: "user @ Ada" });
		const ided = stubFetch([{ status: 200, body: { id: "u_1" } }]);
		expect(await verifyToken("t", { fetch: ided.fetch })).toEqual({ ok: true, subject: "user @ u_1" });
		const empty = stubFetch([{ status: 200, body: {} }]);
		expect(await verifyToken("t", { fetch: empty.fetch })).toEqual({ ok: true, subject: "user @ unknown" });
	});

	it("sends the request to the base URL override", async () => {
		const stub = stubFetch([{ status: 200, body: { email: "user@example.com" } }]);
		await verifyToken("token", { baseUrl: "https://override.example", fetch: stub.fetch });
		expect(stub.calls[0]?.url).toBe("https://override.example/me");
	});

	it("returns ok:false with the error message on 401", async () => {
		const stub = stubFetch([{ status: 401, body: { messages: ["Invalid token"] } }]);
		const result = await verifyToken("bad", { fetch: stub.fetch });
		expect(result.ok).toBe(false);
		expect((result as { ok: boolean; message?: string }).message).toMatch(/→ 401/);
	});

	it("returns ok:false when the network layer throws", async () => {
		const throwing: typeof fetch = async () => {
			throw new TypeError("network down");
		};
		const result = await verifyToken("t", { fetch: throwing });
		expect(result.ok).toBe(false);
		expect((result as { ok: boolean; message?: string }).message).toMatch(/network down/);
	});
});
`;
}
