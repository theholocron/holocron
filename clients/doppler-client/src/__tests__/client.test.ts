import { describe, expect, it } from "vitest";
import { createDopplerClient } from "../index.js";
import { stubFetch } from "./helpers.js";

const TOKEN = "dp.st.test.abc123";

describe("createDopplerClient", () => {
	it("sends Bearer authorization header", async () => {
		const { fetch, calls } = stubFetch([{ body: {} }]);
		const client = createDopplerClient({ token: TOKEN, fetch });
		await client.me.get();
		expect(calls[0]?.headers.authorization).toBe(`Bearer ${TOKEN}`);
	});

	it("targets the Doppler v3 base URL", async () => {
		const { fetch, calls } = stubFetch([{ body: {} }]);
		const client = createDopplerClient({ token: TOKEN, fetch });
		await client.me.get();
		expect(calls[0]?.url).toContain("https://api.doppler.com/v3");
	});

	it("respects baseUrl override", async () => {
		const { fetch, calls } = stubFetch([{ body: {} }]);
		const client = createDopplerClient({
			token: TOKEN,
			baseUrl: "https://doppler.test.invalid/v3",
			fetch,
		});
		await client.me.get();
		expect(calls[0]?.url).toContain("https://doppler.test.invalid/v3");
	});
});
