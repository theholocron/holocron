import { stubFetch } from "@theholocron/http-client/testing";
import { describe, expect, it } from "vitest";

import { createChecklyClient } from "../index.js";

const BASE = "https://checkly.test/v1";

function client(responses: Parameters<typeof stubFetch>[0]) {
	const { fetch, calls } = stubFetch(responses);
	const { checkStatuses } = createChecklyClient({
		token: "tok",
		accountId: "acct-1",
		baseUrl: BASE,
		fetch,
	});
	return { checkStatuses, calls };
}

describe("checkStatuses.get", () => {
	it("reads one check's latest status", async () => {
		const status = {
			checkId: "c1",
			hasFailures: true,
			isDegraded: false,
			lastCheckRunId: "run-1",
			lastRunLocation: "us-east-1",
		};
		const { checkStatuses, calls } = client([{ body: status }]);
		expect(await checkStatuses.get("c1")).toEqual(status);
		expect(calls[0]).toMatchObject({
			method: "GET",
			url: `${BASE}/check-statuses/c1`,
		});
	});

	it("encodes the id in the path", async () => {
		const { checkStatuses, calls } = client([{ body: {} }]);
		await checkStatuses.get("a/b");
		expect(calls[0]?.url).toBe(`${BASE}/check-statuses/a%2Fb`);
	});

	it("throws ProviderApiError 404 for a check that has not run", async () => {
		const { checkStatuses } = client([{ status: 404, body: { message: "Not Found" } }]);
		const err = await checkStatuses.get("c1").catch((e: unknown) => e);
		expect((err as { status?: number }).status).toBe(404);
	});
});
