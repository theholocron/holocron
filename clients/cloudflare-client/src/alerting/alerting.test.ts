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

describe("alerting, when Cloudflare returns nothing or refuses", () => {
	it("reads an empty answer as no destinations and no policies", async () => {
		const { alerting } = client([
			{ status: 204, body: undefined },
			{ status: 204, body: undefined },
		]);
		expect(await alerting.webhooks.list("acct")).toEqual([]);
		expect(await alerting.policies.list("acct")).toEqual([]);
	});

	it("throws on a 403 or 401", async () => {
		const refused = (status: number) => ({
			status,
			body: { success: false, errors: [{ code: 10000, message: "no" }] },
		});
		const { alerting } = client([refused(403), refused(401), refused(403), refused(403)]);
		await expect(alerting.webhooks.list("acct")).rejects.toThrow();
		await expect(alerting.webhooks.create("acct", { name: "n", url: "u" })).rejects.toThrow();
		await expect(alerting.policies.list("acct")).rejects.toThrow();
		await expect(
			alerting.policies.create("acct", { name: "p", alert_type: "t", enabled: true, mechanisms: {} })
		).rejects.toThrow();
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
