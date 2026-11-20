import { describe, expect, it } from "vitest";

import { createCloudflareClient } from "../index.js";
import { cfOk, stubFetch } from "../test-helpers.js";

const BASE = "https://cf.test/client/v4";

function client(responses: Parameters<typeof stubFetch>[0]) {
	const { fetch, calls } = stubFetch(responses);
	return { alerting: createCloudflareClient({ token: "tok", baseUrl: BASE, fetch }).alerting, calls };
}

describe("alerting.webhooks", () => {
	it("lists destinations", async () => {
		const { alerting, calls } = client([cfOk([{ id: "w1", name: "n", url: "https://x/y" }])]);
		expect(await alerting.webhooks.list("acct")).toEqual([{ id: "w1", name: "n", url: "https://x/y" }]);
		expect(calls[0]?.method).toBe("GET");
		expect(calls[0]?.url).toContain("/accounts/acct/alerting/v3/destinations/webhooks");
	});

	it("creates a destination with name, url and secret", async () => {
		const { alerting, calls } = client([cfOk({ id: "w1" })]);
		expect(await alerting.webhooks.create("acct", { name: "n", url: "https://x/y", secret: "s" })).toEqual({
			id: "w1",
		});
		expect(calls[0]?.method).toBe("POST");
		expect(calls[0]?.body).toEqual({ name: "n", url: "https://x/y", secret: "s" });
	});
});

describe("alerting.policies", () => {
	const input = { name: "p", alert_type: "incident_alert", enabled: true, mechanisms: { webhooks: [{ id: "w1" }] } };

	it("lists policies", async () => {
		const { alerting, calls } = client([cfOk([{ id: "p1", ...input }])]);
		expect(await alerting.policies.list("acct")).toHaveLength(1);
		expect(calls[0]?.url).toContain("/accounts/acct/alerting/v3/policies");
	});

	it("creates a policy", async () => {
		const { alerting, calls } = client([cfOk({ id: "p1" })]);
		await alerting.policies.create("acct", input);
		expect(calls[0]?.method).toBe("POST");
		expect(calls[0]?.body).toEqual(input);
	});

	it("replaces a policy with PUT", async () => {
		const { alerting, calls } = client([cfOk({ id: "p1" })]);
		await alerting.policies.update("acct", "p1", input);
		expect(calls[0]?.method).toBe("PUT");
		expect(calls[0]?.url).toContain("/alerting/v3/policies/p1");
	});
});
