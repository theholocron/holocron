import { stubFetch } from "@theholocron/http-client/testing";
import { describe, expect, it } from "vitest";

import { ChecklyMonitoring } from "../capabilities/monitoring.js";
import { createChecklyClient } from "../rest.js";

function makeCapability(
	responses: Array<{ status?: number; body?: unknown }>,
	opts: { checks?: Parameters<typeof ChecklyMonitoring.prototype.ensureCheck>[0][] } = {}
) {
	const stub = stubFetch(responses);
	const client = createChecklyClient({ token: "t", accountId: "acct-1", fetch: stub.fetch });
	const capability = new ChecklyMonitoring(() => client, { checks: opts.checks });
	return { capability, stub };
}

describe("ChecklyMonitoring", () => {
	it("constructs with a Checkly client", () => {
		const { capability } = makeCapability([]);
		expect(capability.key).toBe("monitoring");
	});

	it("exposes the checks it was configured with", () => {
		const input = { name: "uptime", url: "https://example.com" };
		const { capability } = makeCapability([], { checks: [input] });
		expect(capability.checks).toEqual([input]);
	});

	it("defaults checks to an empty array when none are configured", () => {
		const { capability } = makeCapability([]);
		expect(capability.checks).toEqual([]);
	});

	describe("whoami", () => {
		it("reports ok when the checks list request succeeds", async () => {
			const { capability } = makeCapability([{ status: 200, body: [] }]);
			expect(await capability.whoami()).toEqual({ ok: true });
		});

		it("reports not ok when the checks list request fails", async () => {
			const { capability } = makeCapability([{ status: 401, body: { messages: ["invalid"] } }]);
			expect(await capability.whoami()).toEqual({ ok: false });
		});
	});

	describe("ensureCheck", () => {
		const input = {
			name: "Sentinel webhook uptime",
			url: "https://sentinel.theholocron.dev/api/webhook",
			method: "GET" as const,
			assertions: [{ source: "status_code" as const, comparison: "equals" as const, target: "405" }],
		};

		it("creates a check when no exact name match exists", async () => {
			const { capability, stub } = makeCapability([
				{ status: 200, body: [] },
				{ status: 200, body: { id: "check-1", name: input.name } },
			]);

			const result = await capability.ensureCheck(input);

			expect(result).toEqual({ check: { id: "check-1", name: input.name }, alreadyExists: false });
			expect(stub.calls[0]?.url).toContain("/checks");
			expect(stub.calls[0]?.url).toContain(`search=${input.name.replace(/ /g, "+")}`);
			expect(stub.calls[1]?.method).toBe("POST");
			expect(stub.calls[1]?.url).toContain("/checks/api");
			expect(stub.calls[1]?.body).toMatchObject({
				name: input.name,
				request: {
					url: input.url,
					method: "GET",
					assertions: [{ source: "STATUS_CODE", comparison: "EQUALS", target: "405" }],
				},
			});
		});

		it("updates the existing check when a partial-search candidate matches the exact name", async () => {
			const { capability, stub } = makeCapability([
				{
					status: 200,
					body: [
						{ id: "other", name: "Sentinel webhook uptime check" },
						{ id: "check-1", name: input.name },
					],
				},
				{ status: 200, body: { id: "check-1", name: input.name } },
			]);

			const result = await capability.ensureCheck(input);

			expect(result).toEqual({ check: { id: "check-1", name: input.name }, alreadyExists: true });
			expect(stub.calls[1]?.method).toBe("PUT");
			expect(stub.calls[1]?.url).toContain("/checks/api/check-1");
		});

		it("creates (rather than updates) when the search only returns partial-match candidates", async () => {
			const { capability, stub } = makeCapability([
				{ status: 200, body: [{ id: "other", name: "Sentinel webhook uptime check" }] },
				{ status: 200, body: { id: "check-2", name: input.name } },
			]);

			const result = await capability.ensureCheck(input);

			expect(result.alreadyExists).toBe(false);
			expect(stub.calls[1]?.method).toBe("POST");
		});

		it("defaults method to GET and omits optional fields when not provided", async () => {
			const { capability, stub } = makeCapability([
				{ status: 200, body: [] },
				{ status: 200, body: { id: "check-3", name: "minimal" } },
			]);

			await capability.ensureCheck({ name: "minimal", url: "https://example.com" });

			expect(stub.calls[1]?.body).toMatchObject({
				name: "minimal",
				request: { url: "https://example.com", method: "GET", assertions: [] },
			});
		});

		it("includes frequency, activated, locations, shouldFail, and assertion property/target when provided", async () => {
			const { capability, stub } = makeCapability([
				{ status: 200, body: [] },
				{ status: 200, body: { id: "check-4", name: "full" } },
			]);

			await capability.ensureCheck({
				name: "full",
				url: "https://example.com",
				frequency: 5,
				activated: false,
				locations: ["us-east-1", "eu-west-1"],
				shouldFail: true,
				assertions: [{ source: "header", comparison: "contains", property: "content-type", target: "json" }],
			});

			expect(stub.calls[1]?.body).toMatchObject({
				name: "full",
				frequency: 5,
				activated: false,
				locations: ["us-east-1", "eu-west-1"],
				shouldFail: true,
				request: {
					assertions: [
						{ source: "HEADERS", comparison: "CONTAINS", property: "content-type", target: "json" },
					],
				},
			});
		});

		it("omits locations and shouldFail when not provided", async () => {
			const { capability, stub } = makeCapability([
				{ status: 200, body: [] },
				{ status: 200, body: { id: "check-5", name: "no-locations" } },
			]);

			await capability.ensureCheck({ name: "no-locations", url: "https://example.com" });

			expect(stub.calls[1]?.body).not.toHaveProperty("locations");
			expect(stub.calls[1]?.body).not.toHaveProperty("shouldFail");
		});
	});
});
