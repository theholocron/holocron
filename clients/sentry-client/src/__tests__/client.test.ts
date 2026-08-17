import { describe, expect, it } from "vitest";

import { createSentryClient } from "../index.js";
import { stubFetch } from "./helpers.js";

const TOKEN = "sntryu_test-token";

describe("createSentryClient", () => {
	it("sends Bearer authorization header", async () => {
		const { fetch, calls } = stubFetch([{ body: [] }]);
		const client = createSentryClient({ token: TOKEN, fetch });
		await client.auth.organizations();
		expect(calls[0]?.headers.authorization).toBe(`Bearer ${TOKEN}`);
	});

	it("targets the Sentry v0 base URL", async () => {
		const { fetch, calls } = stubFetch([{ body: [] }]);
		const client = createSentryClient({ token: TOKEN, fetch });
		await client.auth.organizations();
		expect(calls[0]?.url).toContain("https://sentry.io/api/0");
	});

	it("respects baseUrl override", async () => {
		const { fetch, calls } = stubFetch([{ body: [] }]);
		const client = createSentryClient({ token: TOKEN, baseUrl: "https://sentry.test/api/0", fetch });
		await client.auth.organizations();
		expect(calls[0]?.url).toContain("https://sentry.test/api/0");
	});
});
