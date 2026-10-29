import { stubFetch } from "@theholocron/http-client/testing";
import { describe, expect, it } from "vitest";

import { createChecklyClient } from "./index.js";

const TOKEN = "cu_test-token";

describe("createChecklyClient", () => {
	it("sends Bearer authorization header", async () => {
		const { fetch, calls } = stubFetch([{ body: [] }]);
		const client = createChecklyClient({ token: TOKEN, accountId: "acct-1", fetch });
		await client.checks.list();
		expect(calls[0]?.headers.authorization).toBe(`Bearer ${TOKEN}`);
	});

	it("sends the account id as x-checkly-account", async () => {
		const { fetch, calls } = stubFetch([{ body: [] }]);
		const client = createChecklyClient({ token: TOKEN, accountId: "acct-1", fetch });
		await client.checks.list();
		expect(calls[0]?.headers["x-checkly-account"]).toBe("acct-1");
	});

	it("targets the Checkly v1 base URL", async () => {
		const { fetch, calls } = stubFetch([{ body: [] }]);
		const client = createChecklyClient({ token: TOKEN, accountId: "acct-1", fetch });
		await client.checks.list();
		expect(calls[0]?.url).toContain("https://api.checklyhq.com/v1");
	});

	it("respects baseUrl override", async () => {
		const { fetch, calls } = stubFetch([{ body: [] }]);
		const client = createChecklyClient({
			token: TOKEN,
			accountId: "acct-1",
			baseUrl: "https://checkly.test/v1",
			fetch,
		});
		await client.checks.list();
		expect(calls[0]?.url).toContain("https://checkly.test/v1");
	});
});
