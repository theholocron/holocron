import { stubFetch } from "@theholocron/http-client/testing";
import { describe, expect, it } from "vitest";

import { createChecklyClient } from "../index.js";

const BASE = "https://checkly.test/v1";

function client(responses: Parameters<typeof stubFetch>[0]) {
	const { fetch, calls } = stubFetch(responses);
	return {
		checks: createChecklyClient({
			token: "tok",
			accountId: "acct-1",
			baseUrl: BASE,
			fetch,
		}).checks,
		calls,
	};
}

const check = {
	id: "chk-1",
	name: "Sentinel webhook uptime",
	checkType: "API" as const,
	activated: true,
	frequency: 5,
	locations: ["us-east-1"],
	tags: ["sentinel"],
	shouldFail: false,
	request: {
		url: "https://sentinel.theholocron.dev/api/webhook",
		method: "GET" as const,
	},
	created_at: "2026-01-01T00:00:00.000Z",
	updated_at: null,
};

describe("checks.list", () => {
	it("GETs /checks with no query params when none given", async () => {
		const { checks, calls } = client([{ body: [check] }]);
		const result = await checks.list();
		expect(calls[0]?.url).toContain(`${BASE}/checks`);
		expect(calls[0]?.url).not.toContain("search=");
		expect(result).toEqual([check]);
	});

	it("passes a search param for a case-insensitive partial name match", async () => {
		const { checks, calls } = client([{ body: [check] }]);
		await checks.list({ search: "webhook" });
		expect(decodeURIComponent(calls[0]!.url)).toContain("search=webhook");
	});

	it("passes limit and page params", async () => {
		const { checks, calls } = client([{ body: [] }]);
		await checks.list({ limit: 10, page: 2 });
		expect(calls[0]?.url).toContain("limit=10");
		expect(calls[0]?.url).toContain("page=2");
	});
});

describe("checks.get", () => {
	it("GETs /checks/{id}", async () => {
		const { checks, calls } = client([{ body: check }]);
		const result = await checks.get("chk-1");
		expect(calls[0]?.url).toContain(`${BASE}/checks/chk-1`);
		expect(result.id).toBe("chk-1");
	});
});

describe("checks.create", () => {
	it("POSTs to /checks/api with the check definition", async () => {
		const { checks, calls } = client([{ body: check }]);
		await checks.create({
			name: "Sentinel webhook uptime",
			frequency: 5,
			locations: ["us-east-1"],
			request: {
				url: "https://sentinel.theholocron.dev/api/webhook",
				method: "GET",
				assertions: [
					{
						source: "STATUS_CODE",
						comparison: "EQUALS",
						target: "405",
					},
				],
			},
		});
		expect(calls[0]?.method).toBe("POST");
		expect(calls[0]?.url).toContain(`${BASE}/checks/api`);
		expect(calls[0]?.body).toMatchObject({
			name: "Sentinel webhook uptime",
			frequency: 5,
		});
	});

	it("passes shouldFail through for a check whose healthy response is an HTTP error status", async () => {
		const { checks, calls } = client([{ body: { ...check, shouldFail: true } }]);
		await checks.create({
			name: "Sentinel webhook uptime",
			shouldFail: true,
			request: {
				url: "https://sentinel.theholocron.dev/api/webhook",
				method: "GET",
				assertions: [
					{
						source: "STATUS_CODE",
						comparison: "EQUALS",
						target: "405",
					},
				],
			},
		});
		expect(calls[0]?.body).toMatchObject({ shouldFail: true });
	});

	it("sets bodyType RAW on the wire when a request body is given", async () => {
		const { checks, calls } = client([{ body: check }]);
		await checks.create({
			name: "Sentinel webhook signature verification",
			shouldFail: true,
			request: {
				url: "https://sentinel.theholocron.dev/api/webhook",
				method: "POST",
				body: "{}",
				assertions: [
					{
						source: "STATUS_CODE",
						comparison: "EQUALS",
						target: "401",
					},
				],
			},
		});
		expect(calls[0]?.body).toMatchObject({
			request: { body: "{}", bodyType: "RAW" },
		});
	});

	it("omits bodyType on the wire when no request body is given", async () => {
		const { checks, calls } = client([{ body: check }]);
		await checks.create({
			name: "Sentinel webhook uptime",
			request: {
				url: "https://sentinel.theholocron.dev/api/webhook",
				method: "GET",
			},
		});
		const sentRequest = (calls[0]?.body as { request: Record<string, unknown> }).request;
		expect(sentRequest).not.toHaveProperty("bodyType");
		expect(sentRequest).not.toHaveProperty("body");
	});
});

describe("checks.update", () => {
	it("PUTs to /checks/api/{id} with the check definition", async () => {
		const { checks, calls } = client([{ body: check }]);
		await checks.update("chk-1", {
			name: "Sentinel webhook uptime",
			request: {
				url: "https://sentinel.theholocron.dev/api/webhook",
				method: "GET",
			},
		});
		expect(calls[0]?.method).toBe("PUT");
		expect(calls[0]?.url).toContain(`${BASE}/checks/api/chk-1`);
	});

	it("sets bodyType RAW on the wire when a request body is given", async () => {
		const { checks, calls } = client([{ body: check }]);
		await checks.update("chk-1", {
			name: "Sentinel webhook signature verification",
			request: {
				url: "https://sentinel.theholocron.dev/api/webhook",
				method: "POST",
				body: "{}",
			},
		});
		expect(calls[0]?.body).toMatchObject({
			request: { body: "{}", bodyType: "RAW" },
		});
	});
});

describe("checks.delete", () => {
	it("DELETEs /checks/{id}", async () => {
		const { checks, calls } = client([{ status: 204, body: undefined }]);
		await checks.delete("chk-1");
		expect(calls[0]?.method).toBe("DELETE");
		expect(calls[0]?.url).toContain(`${BASE}/checks/chk-1`);
	});
});
