import { describe, expect, it } from "vitest";

import { createInfisicalClient } from "../index.js";
import { stubFetch } from "./helpers.js";

const TOKEN = "infisical-test-pat";

describe("createInfisicalClient", () => {
	it("sends Bearer authorization header", async () => {
		const { fetch, calls } = stubFetch([{ body: { workspaces: [] } }]);
		const client = createInfisicalClient({ token: TOKEN, fetch });
		await client.workspaces.list();
		expect(calls[0]?.headers.authorization).toBe(`Bearer ${TOKEN}`);
	});

	it("targets the Infisical base URL", async () => {
		const { fetch, calls } = stubFetch([{ body: { workspaces: [] } }]);
		const client = createInfisicalClient({ token: TOKEN, fetch });
		await client.workspaces.list();
		expect(calls[0]?.url).toContain("https://app.infisical.com/api");
	});

	it("respects baseUrl override", async () => {
		const { fetch, calls } = stubFetch([{ body: { workspaces: [] } }]);
		const client = createInfisicalClient({
			token: TOKEN,
			baseUrl: "https://infisical.test.invalid/api",
			fetch,
		});
		await client.workspaces.list();
		expect(calls[0]?.url).toContain("https://infisical.test.invalid/api");
	});
});

describe("error handling", () => {
	it("throws ProviderApiError on non-2xx response", async () => {
		const { fetch } = stubFetch([{ status: 401, body: { message: "Unauthorized" } }]);
		const client = createInfisicalClient({ token: "bad", fetch });
		const err = await client.workspaces.list().catch((e: unknown) => e);
		expect((err as Error).name).toBe("ProviderApiError");
	});
});
