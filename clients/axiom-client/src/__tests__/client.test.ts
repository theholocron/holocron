import { describe, expect, it } from "vitest";

import { createAxiomClient } from "../index.js";
import { stubFetch } from "./helpers.js";

const TOKEN = "xaat-test-token";

function makeClient(responses: Parameters<typeof stubFetch>[0]) {
	const { fetch, calls } = stubFetch(responses);
	const client = createAxiomClient({ token: TOKEN, fetch });
	return { client, calls };
}

describe("createAxiomClient", () => {
	it("sends Bearer authorization header", async () => {
		const { client, calls } = makeClient([{ body: { id: "u1" } }]);
		await client.user.me();
		expect(calls[0]?.headers.authorization).toBe(`Bearer ${TOKEN}`);
	});

	it("targets the default Axiom base URL", async () => {
		const { client, calls } = makeClient([{ body: { id: "u1" } }]);
		await client.user.me();
		expect(calls[0]?.url).toContain("https://api.axiom.co");
	});

	it("respects baseUrl override", async () => {
		const { fetch, calls } = stubFetch([{ body: { id: "u1" } }]);
		const client = createAxiomClient({ token: TOKEN, baseUrl: "https://axiom.test", fetch });
		await client.user.me();
		expect(calls[0]?.url).toContain("https://axiom.test");
	});

	it("throws ProviderApiError on non-2xx response", async () => {
		const { fetch } = stubFetch([{ status: 401, body: { message: "invalid token" } }]);
		const client = createAxiomClient({ token: TOKEN, fetch });
		const err = await client.user.me().catch((e: unknown) => e);
		expect((err as Error).name).toBe("ProviderApiError");
	});
});

describe("user.me", () => {
	it("GET /v2/user", async () => {
		const { client, calls } = makeClient([{ body: { id: "u1", name: "Dev", email: "dev@acme.com" } }]);
		const result = await client.user.me();
		expect(calls[0]?.url).toContain("/v2/user");
		expect(calls[0]?.method).toBe("GET");
		expect(result).toEqual({ id: "u1", name: "Dev", email: "dev@acme.com" });
	});
});

describe("datasets.get", () => {
	it("GET /v2/datasets/:name", async () => {
		const { client, calls } = makeClient([{ body: { id: "d1", name: "logs" } }]);
		const result = await client.datasets.get("logs");
		expect(calls[0]?.url).toContain("/v2/datasets/logs");
		expect(calls[0]?.method).toBe("GET");
		expect(result).toEqual({ id: "d1", name: "logs" });
	});

	it("URL-encodes the dataset name", async () => {
		const { client, calls } = makeClient([{ body: { id: "d1", name: "my logs" } }]);
		await client.datasets.get("my logs");
		expect(calls[0]?.url).toContain("/v2/datasets/my%20logs");
	});
});

describe("datasets.create", () => {
	it("POST /v2/datasets", async () => {
		const { client, calls } = makeClient([{ status: 201, body: { id: "d2", name: "new-logs" } }]);
		const result = await client.datasets.create({ name: "new-logs", description: "test dataset" });
		expect(calls[0]?.method).toBe("POST");
		expect(calls[0]?.url).toContain("/v2/datasets");
		expect(calls[0]?.body).toEqual({ name: "new-logs", description: "test dataset" });
		expect(result).toEqual({ id: "d2", name: "new-logs" });
	});
});
