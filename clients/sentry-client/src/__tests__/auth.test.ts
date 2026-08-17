import { describe, expect, it } from "vitest";

import { createSentryClient } from "../index.js";
import { stubFetch } from "./helpers.js";

const BASE = "https://sentry.test/api/0";

function client(responses: Parameters<typeof stubFetch>[0]) {
	const { fetch, calls } = stubFetch(responses);
	return { auth: createSentryClient({ token: "tok", baseUrl: BASE, fetch }).auth, calls };
}

describe("auth.organizations", () => {
	it("GETs /organizations/", async () => {
		const { auth, calls } = client([{ body: [{ id: "1", slug: "my-org", name: "My Org" }] }]);
		const result = await auth.organizations();
		expect(calls[0]?.url).toContain(`${BASE}/organizations/`);
		expect(result).toEqual([{ id: "1", slug: "my-org", name: "My Org" }]);
	});
});

describe("auth.getOrg", () => {
	it("GETs /organizations/{org}/", async () => {
		const { auth, calls } = client([{ body: { id: "1", slug: "my-org", name: "My Org" } }]);
		const result = await auth.getOrg("my-org");
		expect(calls[0]?.url).toContain(`${BASE}/organizations/my-org/`);
		expect(result.slug).toBe("my-org");
	});
});
