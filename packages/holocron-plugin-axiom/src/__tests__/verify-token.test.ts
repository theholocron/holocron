import { describe, expect, it } from "vitest";

import { verifyToken } from "../verify-token.js";
import { stubFetch } from "./helpers.js";

type Result = { ok: boolean; subject?: string; message?: string };

describe("verifyToken", () => {
	it("returns ok with the email subject when /v2/user returns 200", async () => {
		const stub = stubFetch([{ status: 200, body: { id: "u1", name: "New", email: "new@example.com" } }]);
		const result = (await verifyToken("xaat-abc", { fetch: stub.fetch })) as Result;
		expect(result.ok).toBe(true);
		expect(result.subject).toMatch(/user @ new@example.com/);
	});

	it("falls back to emails[0], then name, then id, then 'unknown'", async () => {
		const byEmails = (await verifyToken("t", {
			fetch: stubFetch([{ status: 200, body: { id: "u1", emails: ["first@example.com"] } }]).fetch,
		})) as Result;
		expect(byEmails.subject).toMatch(/user @ first@example.com/);

		const byName = (await verifyToken("t", {
			fetch: stubFetch([{ status: 200, body: { id: "u1", name: "Neo" } }]).fetch,
		})) as Result;
		expect(byName.subject).toMatch(/user @ Neo/);

		const byId = (await verifyToken("t", {
			fetch: stubFetch([{ status: 200, body: { id: "u9" } }]).fetch,
		})) as Result;
		expect(byId.subject).toMatch(/user @ u9/);

		const unknown = (await verifyToken("t", {
			fetch: stubFetch([{ status: 200, body: {} }]).fetch,
		})) as Result;
		expect(unknown.subject).toMatch(/user @ unknown/);
	});

	it("returns ok:false with the error message on 401", async () => {
		const stub = stubFetch([{ status: 401, body: { message: "Invalid API token" } }]);
		const result = (await verifyToken("bad", { fetch: stub.fetch })) as Result;
		expect(result.ok).toBe(false);
		expect(result.message).toMatch(/→ 401/);
	});

	it("returns ok:false when the network layer throws", async () => {
		const throwing: typeof fetch = async () => {
			throw new TypeError("network down");
		};
		const result = (await verifyToken("anything", { fetch: throwing })) as Result;
		expect(result.ok).toBe(false);
		expect(result.message).toMatch(/network down/);
	});

	it("hits the configured base URL", async () => {
		const stub = stubFetch([{ status: 200, body: { id: "u1" } }]);
		await verifyToken("t", { fetch: stub.fetch, baseUrl: "https://api.eu.axiom.co" });
		expect(stub.calls[0]?.url).toBe("https://api.eu.axiom.co/v2/user");
	});
});
