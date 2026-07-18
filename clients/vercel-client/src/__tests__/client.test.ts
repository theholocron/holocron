import { describe, expect, it } from "vitest";
import { createVercelClient } from "../index.js";
import { stubFetch } from "./helpers.js";

const TOKEN = "vercel-test-token";

describe("createVercelClient", () => {
	it("sends Bearer authorization header", async () => {
		const { fetch, calls } = stubFetch([{ body: { user: {} } }]);
		const client = createVercelClient({ token: TOKEN, fetch });
		await client.user.get();
		expect(calls[0]?.headers.authorization).toBe(`Bearer ${TOKEN}`);
	});

	it("targets the Vercel base URL", async () => {
		const { fetch, calls } = stubFetch([{ body: { user: {} } }]);
		const client = createVercelClient({ token: TOKEN, fetch });
		await client.user.get();
		expect(calls[0]?.url).toContain("https://api.vercel.com");
	});

	it("appends teamId to every request when provided", async () => {
		const { fetch, calls } = stubFetch([{ body: { user: {} } }]);
		const client = createVercelClient({
			token: TOKEN,
			teamId: "team_abc",
			fetch,
		});
		await client.user.get();
		expect(calls[0]?.url).toContain("teamId=team_abc");
	});

	it("omits teamId when not provided", async () => {
		const { fetch, calls } = stubFetch([{ body: { user: {} } }]);
		const client = createVercelClient({ token: TOKEN, fetch });
		await client.user.get();
		expect(calls[0]?.url).not.toContain("teamId");
	});

	it("respects baseUrl override", async () => {
		const { fetch, calls } = stubFetch([{ body: { user: {} } }]);
		const client = createVercelClient({
			token: TOKEN,
			baseUrl: "https://vercel.test.invalid",
			fetch,
		});
		await client.user.get();
		expect(calls[0]?.url).toContain("https://vercel.test.invalid");
	});
});
