import { ProviderApiError } from "@theholocron/cli";
import { describe, expect, it } from "vitest";

import { createAxiomClient, DEFAULT_BASE_URL } from "../rest.js";
import { stubFetch } from "./helpers.js";

describe("createAxiomClient", () => {
	it("sends bearer + accept headers and returns the parsed body", async () => {
		const stub = stubFetch([{ status: 200, body: { id: "u1", email: "me@example.com" } }]);
		const client = createAxiomClient({ token: "xaat-abc", fetch: stub.fetch });
		const me = await client.getCurrentUser();
		expect(me.email).toBe("me@example.com");
		expect(stub.calls[0]?.url).toBe(`${DEFAULT_BASE_URL}/v2/user`);
		expect(stub.calls[0]?.headers["authorization"]).toBe("Bearer xaat-abc");
		expect(stub.calls[0]?.headers["accept"]).toBe("application/json");
	});

	it("URL-encodes the dataset name on getDataset", async () => {
		const stub = stubFetch([{ status: 200, body: { id: "d1", name: "holocron ci" } }]);
		const client = createAxiomClient({ token: "t", fetch: stub.fetch });
		await client.getDataset("holocron ci");
		expect(stub.calls[0]?.url).toBe(`${DEFAULT_BASE_URL}/v2/datasets/holocron%20ci`);
	});

	it("POSTs a JSON body to create a dataset", async () => {
		const stub = stubFetch([{ status: 200, body: { id: "d2", name: "holocron-ci" } }]);
		const client = createAxiomClient({ token: "t", fetch: stub.fetch });
		await client.createDataset({ name: "holocron-ci", description: "Managed by holocron" });
		expect(stub.calls[0]?.method).toBe("POST");
		expect(stub.calls[0]?.headers["content-type"]).toBe("application/json");
		expect(stub.calls[0]?.body).toMatchObject({ name: "holocron-ci", description: "Managed by holocron" });
	});

	it("honours a custom base URL", async () => {
		const stub = stubFetch([{ status: 200, body: { id: "u1" } }]);
		const client = createAxiomClient({ token: "t", baseUrl: "https://api.eu.axiom.co", fetch: stub.fetch });
		await client.getCurrentUser();
		expect(stub.calls[0]?.url).toBe("https://api.eu.axiom.co/v2/user");
	});

	it("throws ProviderApiError with the HTTP status on non-2xx", async () => {
		const stub = stubFetch([{ status: 401, body: { message: "invalid token" } }]);
		const client = createAxiomClient({ token: "bad", fetch: stub.fetch });
		const err = await client.getCurrentUser().catch((e: unknown) => e);
		expect(err).toBeInstanceOf(ProviderApiError);
		expect((err as ProviderApiError).status).toBe(401);
		expect((err as ProviderApiError).message).toMatch(/→ 401/);
	});

	it("wraps transport-level failures with status 0", async () => {
		const throwing: typeof fetch = async () => {
			throw new TypeError("fetch failed");
		};
		const client = createAxiomClient({ token: "t", fetch: throwing });
		const err = await client.getDataset("x").catch((e: unknown) => e);
		expect(err).toBeInstanceOf(ProviderApiError);
		expect((err as ProviderApiError).status).toBe(0);
		expect((err as ProviderApiError).message).toMatch(/TypeError: fetch failed/);
	});
});
