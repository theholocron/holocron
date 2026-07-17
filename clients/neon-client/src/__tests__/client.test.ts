import { describe, expect, it } from "vitest";
import { createNeonClient } from "../index.js";
import { stubFetch } from "./helpers.js";

const TOKEN = "neon-test-pat";

describe("createNeonClient", () => {
	it("sends Bearer authorization header", async () => {
		const { fetch, calls } = stubFetch([{ body: {} }]);
		const client = createNeonClient({ token: TOKEN, fetch });
		await client.users.me();
		expect(calls[0]?.headers.authorization).toBe(`Bearer ${TOKEN}`);
	});

	it("targets the Neon v2 base URL", async () => {
		const { fetch, calls } = stubFetch([{ body: {} }]);
		const client = createNeonClient({ token: TOKEN, fetch });
		await client.users.me();
		expect(calls[0]?.url).toContain("https://console.neon.tech/api/v2");
	});

	it("respects baseUrl override", async () => {
		const { fetch, calls } = stubFetch([{ body: {} }]);
		const client = createNeonClient({
			token: TOKEN,
			baseUrl: "https://neon.test.invalid/api/v2",
			fetch,
		});
		await client.users.me();
		expect(calls[0]?.url).toContain("https://neon.test.invalid/api/v2");
	});
});
