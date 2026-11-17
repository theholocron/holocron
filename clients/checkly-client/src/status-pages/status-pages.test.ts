import { stubFetch } from "@theholocron/http-client/testing";
import { describe, expect, it } from "vitest";

import { createChecklyClient } from "../index.js";

const V3 = "https://checkly.test/v3";

function client(responses: Parameters<typeof stubFetch>[0]) {
	const { fetch, calls } = stubFetch(responses);
	const { statusPages } = createChecklyClient({
		token: "tok",
		accountId: "acct-1",
		baseUrl: "https://checkly.test/v1",
		fetch,
	});
	return { statusPages, calls };
}

describe("statusPages", () => {
	it("reads the v3 API with the account header", async () => {
		const { statusPages, calls } = client([
			{ body: { length: 1, entries: [{ id: "p1", name: "N" }], nextId: null } },
		]);
		expect(await statusPages.list()).toEqual([{ id: "p1", name: "N" }]);
		expect(calls[0]?.url).toBe(`${V3}/status-pages?limit=100`);
		expect(calls[0]?.headers).toMatchObject({ "x-checkly-account": "acct-1" });
	});

	it("follows nextId until there is none", async () => {
		const { statusPages, calls } = client([
			{ body: { length: 1, entries: [{ id: "a" }], nextId: "n1" } },
			{ body: { length: 1, entries: [{ id: "b" }], nextId: null } },
		]);
		expect(await statusPages.components.list("p1")).toEqual([{ id: "a" }, { id: "b" }]);
		expect(new URL(calls[1]!.url).searchParams.get("nextId")).toBe("n1");
		expect(new URL(calls[1]!.url).pathname).toBe("/v3/status-pages/p1/components");
	});

	it("refuses a listing that never ends", async () => {
		const page = { body: { length: 1, entries: [{ id: "a" }], nextId: "again" } };
		const { statusPages } = client(Array.from({ length: 50 }, () => page));
		await expect(statusPages.rules.list("p1")).rejects.toThrow(/refusing to read them all/);
	});

	it("makes, reads and replaces a page", async () => {
		const { statusPages, calls } = client([
			{ status: 201, body: { id: "p1" } },
			{ body: { id: "p1" } },
			{ body: { id: "p1" } },
		]);
		await statusPages.create({ name: "N", url: "n", isPrivate: false });
		await statusPages.get("p1");
		await statusPages.update("p1", { name: "N", url: "n", customDomain: "status.example.com" });
		expect(calls.map((c) => [c.method, c.url])).toEqual([
			["POST", `${V3}/status-pages`],
			["GET", `${V3}/status-pages/p1`],
			["PUT", `${V3}/status-pages/p1`],
		]);
		expect(calls[0]?.body).toEqual({ name: "N", url: "n", isPrivate: false });
		expect(calls[2]?.body).toMatchObject({ customDomain: "status.example.com" });
	});

	it("makes and replaces components, with a group as parent", async () => {
		const { statusPages, calls } = client([{ status: 201, body: { id: "c1" } }, { body: { id: "c1" } }]);
		await statusPages.components.create("p1", {
			name: "Sentinel",
			displayOrder: 1,
			type: "SERVICE",
			parentId: "g1",
		});
		await statusPages.components.update("p1", "c1", { name: "Sentinel", displayOrder: 2 });
		expect(calls[0]).toMatchObject({ method: "POST", url: `${V3}/status-pages/p1/components` });
		expect(calls[0]?.body).toMatchObject({ type: "SERVICE", parentId: "g1", displayOrder: 1 });
		expect(calls[1]).toMatchObject({ method: "PUT", url: `${V3}/status-pages/p1/components/c1` });
	});

	it("makes and replaces automation rules with a target impact", async () => {
		const { statusPages, calls } = client([{ status: 201, body: { id: "r1" } }, { body: { id: "r1" } }]);
		const rule = {
			name: "Sentinel",
			firstUpdate: "down",
			lastUpdate: "up",
			tags: ["sentinel"],
			components: [{ componentId: "c1", targetImpact: "MAJOR_OUTAGE" as const }],
		};
		await statusPages.rules.create("p1", rule);
		await statusPages.rules.update("p1", "r1", rule);
		expect(calls[0]).toMatchObject({ method: "POST", url: `${V3}/status-pages/p1/automation-rules` });
		expect(calls[0]?.body).toEqual(rule);
		expect(calls[1]).toMatchObject({ method: "PUT", url: `${V3}/status-pages/p1/automation-rules/r1` });
	});

	it("reads and rechecks the custom domain verification", async () => {
		const verification = {
			status: "pending",
			sslStatus: "pending",
			ownershipVerification: { type: "cname", name: "status.example.com", value: "target.example.net" },
		};
		const { statusPages, calls } = client([
			{ body: verification },
			{ body: { ...verification, status: "active" } },
		]);
		expect(await statusPages.customDomain.verification("p1")).toEqual(verification);
		expect((await statusPages.customDomain.recheck("p1")).status).toBe("active");
		expect(calls.map((c) => [c.method, c.url])).toEqual([
			["GET", `${V3}/status-pages/p1/custom-domain-verifications`],
			["POST", `${V3}/status-pages/p1/custom-domain-verifications/recheck`],
		]);
	});
});
