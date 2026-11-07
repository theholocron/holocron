import { stubFetch } from "@theholocron/http-client/testing";
import { describe, expect, it } from "vitest";

import { verifyToken } from "./verify-token.js";

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

	it("accepts an API token that cannot read the user but can read datasets (403, then 404)", async () => {
		const stub = stubFetch([
			{ status: 403, body: { message: "forbidden" } },
			{ status: 404, body: { message: "not found" } },
		]);
		const result = (await verifyToken("xaat-api", { fetch: stub.fetch })) as Result;
		expect(result).toEqual({ ok: true, subject: "API token" });
		expect(stub.calls[1]?.url).toContain("/v2/datasets/holocron-token-check");
	});

	it("accepts an API token when the dataset read succeeds", async () => {
		const stub = stubFetch([
			{ status: 403, body: {} },
			{ status: 200, body: { id: "d", name: "x" } },
		]);
		expect(((await verifyToken("t", { fetch: stub.fetch })) as Result).ok).toBe(true);
	});

	it("rejects a token that is refused both the user and the datasets", async () => {
		const stub = stubFetch([
			{ status: 403, body: {} },
			{ status: 403, body: {} },
		]);
		const result = (await verifyToken("t", { fetch: stub.fetch })) as Result;
		expect(result.ok).toBe(false);
		expect(result.message).toMatch(/→ 403/);
	});

	it("rejects a token when the dataset read fails on the network", async () => {
		let calls = 0;
		const flaky: typeof fetch = async () => {
			if (calls++ === 0) return new Response("{}", { status: 403 });
			throw new TypeError("network down");
		};
		const result = (await verifyToken("t", { fetch: flaky })) as Result;
		expect(result.ok).toBe(false);
		expect(result.message).toMatch(/network down/);
	});
});
