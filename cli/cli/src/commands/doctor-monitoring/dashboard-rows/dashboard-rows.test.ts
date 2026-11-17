import { describe, expect, it } from "vitest";

import { MissingTokenError, type Monitoring, type MonitoringDashboardState } from "../../../plugin/index.js";
import { dashboardRows } from "./dashboard-rows.js";

const holocron = { name: "The Holocron", tags: ["sentinel", "docs"] };

const state = (over: Partial<MonitoringDashboardState> = {}): MonitoringDashboardState => ({
	exists: true,
	private: true,
	tags: ["docs", "sentinel"],
	others: [],
	...over,
});

const provider = (
	dashboards: Monitoring["dashboards"],
	inspect?: (name: string) => Promise<MonitoringDashboardState>
): Monitoring => ({ dashboards, ...(inspect ? { inspectDashboard: inspect } : {}) }) as unknown as Monitoring;

describe("dashboardRows", () => {
	it("gives no row when no dashboard is declared", async () => {
		expect(await dashboardRows(provider(undefined))).toEqual([]);
		expect(await dashboardRows(provider([]))).toEqual([]);
	});

	it("is a skip when the provider cannot inspect a dashboard", async () => {
		const [row] = await dashboardRows(provider([holocron]));
		expect(row).toMatchObject({ status: "skip", detail: "provider does not implement inspectDashboard" });
	});

	it("passes when the dashboard exists, is private and has the tags (in any order)", async () => {
		const rows = await dashboardRows(provider([holocron], async () => state()));
		expect(rows).toEqual([
			{
				id: "monitoring-dashboards",
				title: "monitoring dashboards match",
				status: "ok",
				detail: "1 of 1 match",
				problems: [],
			},
		]);
	});

	it("fails a dashboard that is missing", async () => {
		const [row] = await dashboardRows(provider([holocron], async () => ({ exists: false, others: [] })));
		expect(row).toMatchObject({ status: "fail", problems: ["missing dashboard The Holocron"] });
	});

	it("fails a public dashboard declared private, and one with the default privacy", async () => {
		const [row] = await dashboardRows(provider([holocron], async () => state({ private: false })));
		expect(row?.status).toBe("fail");
		expect(row?.problems[0]).toMatch(/is public but declared private/);
	});

	it("fails a private dashboard declared public", async () => {
		const [row] = await dashboardRows(provider([{ ...holocron, private: false }], async () => state()));
		expect(row).toMatchObject({
			status: "fail",
			problems: ["dashboard The Holocron: declared public, found private"],
		});
	});

	it("fails differing tags and a differing domain", async () => {
		const [row] = await dashboardRows(
			provider([{ ...holocron, domain: "status.example.com" }], async () =>
				state({ tags: ["sentinel"], domain: "x.dev" })
			)
		);
		expect(row?.problems).toEqual([
			"dashboard The Holocron tags: declared docs, sentinel, found sentinel",
			"dashboard The Holocron domain: declared status.example.com, found x.dev",
		]);
	});

	it("does not compare a domain the config leaves out", async () => {
		const [row] = await dashboardRows(provider([holocron], async () => state({ domain: "x.dev" })));
		expect(row?.status).toBe("ok");
	});

	it("reports dashboards the account holds beyond the declared ones as a skipped info row", async () => {
		const two = { name: "Two", tags: ["a"] };
		const rows = await dashboardRows(
			provider([holocron, two], async (name) =>
				state({
					tags: name === "Two" ? ["a"] : ["docs", "sentinel"],
					others: ["Stray", name === "Two" ? "The Holocron" : "Two"],
				})
			)
		);
		expect(rows.map((r) => [r.id, r.status])).toEqual([
			["monitoring-dashboards", "ok"],
			["monitoring-dashboards-extra", "skip"],
		]);
		expect(rows[1]?.detail).toBe("not declared: Stray");
	});

	it("is a skip for a missing token and a failure for any other error", async () => {
		const noToken = await dashboardRows(
			provider([holocron], async () => {
				throw new MissingTokenError("set CHECKLY_API_KEY");
			})
		);
		expect(noToken[0]?.status).toBe("skip");
		const boom = await dashboardRows(
			provider([holocron], async () => {
				throw new Error("boom");
			})
		);
		expect(boom[0]).toMatchObject({ status: "fail", detail: "boom" });
	});

	it("reads a dashboard that reports no privacy, tags or domain as public, untagged and without a domain", async () => {
		const [row] = await dashboardRows(
			provider([{ name: "The Holocron", tags: ["docs"], domain: "status.example.com" }], async () => ({
				exists: true,
				others: [],
			}))
		);
		expect(row).toMatchObject({
			status: "fail",
			problems: [
				"dashboard The Holocron is public but declared private: anyone with the link can read it",
				"dashboard The Holocron tags: declared docs, found none",
				"dashboard The Holocron domain: declared status.example.com, found none",
			],
		});
	});
});
