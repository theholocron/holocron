import { ProviderApiError } from "@theholocron/cli";
import { stubFetch } from "@theholocron/http-client/testing";
import { describe, expect, it } from "vitest";

import { createChecklyClient } from "./rest.js";

const DEFAULT_BASE_URL = "https://api.checklyhq.com/v1";

describe("createChecklyClient", () => {
	it("sends bearer + accept + x-checkly-account headers and returns the parsed body", async () => {
		const stub = stubFetch([{ status: 200, body: [{ id: "c1", name: "demo" }] }]);
		const client = createChecklyClient({ token: "t", accountId: "acct-1", fetch: stub.fetch });
		const checks = await client.checks.list();
		expect(checks).toEqual([{ id: "c1", name: "demo" }]);
		expect(stub.calls[0]?.url).toBe(`${DEFAULT_BASE_URL}/checks`);
		expect(stub.calls[0]?.headers["authorization"]).toBe("Bearer t");
		expect(stub.calls[0]?.headers["accept"]).toBe("application/json");
		expect(stub.calls[0]?.headers["x-checkly-account"]).toBe("acct-1");
	});

	it("POSTs a JSON body to create a check", async () => {
		const stub = stubFetch([{ status: 200, body: { id: "c2", name: "created" } }]);
		const client = createChecklyClient({ token: "t", accountId: "acct-1", fetch: stub.fetch });
		await client.checks.create({ name: "created", request: { url: "https://example.com", method: "GET" } });
		expect(stub.calls[0]?.method).toBe("POST");
		expect(stub.calls[0]?.url).toBe(`${DEFAULT_BASE_URL}/checks/api`);
		expect(stub.calls[0]?.headers["content-type"]).toBe("application/json");
		expect(stub.calls[0]?.body).toMatchObject({ name: "created" });
	});

	it("PUTs a JSON body to update a check by id", async () => {
		const stub = stubFetch([{ status: 200, body: { id: "c3", name: "updated" } }]);
		const client = createChecklyClient({ token: "t", accountId: "acct-1", fetch: stub.fetch });
		await client.checks.update("c3", { name: "updated", request: { url: "https://example.com", method: "GET" } });
		expect(stub.calls[0]?.method).toBe("PUT");
		expect(stub.calls[0]?.url).toBe(`${DEFAULT_BASE_URL}/checks/api/c3`);
	});

	it("honours a custom base URL", async () => {
		const stub = stubFetch([{ status: 200, body: [] }]);
		const client = createChecklyClient({
			token: "t",
			accountId: "acct-1",
			baseUrl: "https://eu.api.checklyhq.com/v1",
			fetch: stub.fetch,
		});
		await client.checks.list();
		expect(stub.calls[0]?.url).toBe("https://eu.api.checklyhq.com/v1/checks");
	});

	it("throws ProviderApiError with the HTTP status on non-2xx", async () => {
		const stub = stubFetch([{ status: 401, body: { messages: ["invalid"] } }]);
		const client = createChecklyClient({ token: "bad", accountId: "acct-1", fetch: stub.fetch });
		const err = await client.checks.list().catch((e: unknown) => e);
		expect(err).toBeInstanceOf(ProviderApiError);
		expect((err as ProviderApiError).status).toBe(401);
	});

	it("wraps transport-level failures with status 0", async () => {
		const throwing: typeof fetch = async () => {
			throw new TypeError("fetch failed");
		};
		const client = createChecklyClient({ token: "t", accountId: "acct-1", fetch: throwing });
		const err = await client.checks.list().catch((e: unknown) => e);
		expect(err).toBeInstanceOf(ProviderApiError);
		expect((err as ProviderApiError).status).toBe(0);
	});
});
