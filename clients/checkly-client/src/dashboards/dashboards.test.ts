import { stubFetch } from "@theholocron/http-client/testing";
import { describe, expect, it } from "vitest";

import { createChecklyClient } from "../index.js";

const BASE = "https://checkly.test/v1";

function client(responses: Parameters<typeof stubFetch>[0]) {
	const { fetch, calls } = stubFetch(responses);
	const { dashboards } = createChecklyClient({ token: "tok", accountId: "acct-1", baseUrl: BASE, fetch });
	return { dashboards, calls };
}

const dashboard = (n: number) => ({
	id: n,
	dashboardId: `d-${n}`,
	header: `Dashboard ${n}`,
	tags: ["a"],
	isPrivate: true,
	keys: [],
	created_at: "2026-01-01T00:00:00.000Z",
});

describe("dashboards", () => {
	it("lists dashboards, 100 at a time, with the account header", async () => {
		const { dashboards, calls } = client([{ body: [dashboard(1)] }]);
		expect(await dashboards.list()).toEqual([dashboard(1)]);
		expect(calls[0]?.url).toBe(`${BASE}/dashboards?limit=100&page=1`);
		expect(calls[0]?.headers).toMatchObject({ "x-checkly-account": "acct-1" });
	});

	it("reads every page until a short one", async () => {
		const full = Array.from({ length: 100 }, (_, i) => dashboard(i));
		const { dashboards, calls } = client([{ body: full }, { body: [dashboard(100)] }]);
		expect(await dashboards.list()).toHaveLength(101);
		expect(new URL(calls[1]!.url).searchParams.get("page")).toBe("2");
	});

	it("refuses a runaway listing", async () => {
		const full = Array.from({ length: 100 }, (_, i) => dashboard(i));
		const { dashboards } = client(Array.from({ length: 50 }, () => ({ body: full })));
		await expect(dashboards.list()).rejects.toThrow(/refusing to read them all/);
	});

	it("gets one dashboard by its dashboard id", async () => {
		const { dashboards, calls } = client([{ body: dashboard(7) }]);
		expect((await dashboards.get("d-7")).dashboardId).toBe("d-7");
		expect(calls[0]?.url).toBe(`${BASE}/dashboards/d-7`);
	});

	it("creates a dashboard", async () => {
		const { dashboards, calls } = client([{ status: 201, body: dashboard(9) }]);
		await dashboards.create({ header: "The Holocron", tags: ["sentinel"], isPrivate: true });
		expect(calls[0]).toMatchObject({ method: "POST", url: `${BASE}/dashboards` });
		expect(calls[0]?.body).toEqual({ header: "The Holocron", tags: ["sentinel"], isPrivate: true });
	});

	it("updates a dashboard, sending only what it is given", async () => {
		const { dashboards, calls } = client([{ body: dashboard(9) }]);
		await dashboards.update("d-9", { tags: ["docs"] });
		expect(calls[0]).toMatchObject({ method: "PUT", url: `${BASE}/dashboards/d-9` });
		expect(calls[0]?.body).toEqual({ tags: ["docs"] });
	});
});
