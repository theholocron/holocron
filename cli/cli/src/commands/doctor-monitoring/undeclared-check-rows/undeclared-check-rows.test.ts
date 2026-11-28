import { describe, expect, it } from "vitest";

import type { Monitoring, MonitoringCheckInput } from "../../../plugin/index.js";
import type { WorkspaceMonitoring } from "../../workspace-monitoring/index.js";
import { undeclaredCheckRows } from "./undeclared-check-rows.js";

const check = (name: string, tags?: string[]): MonitoringCheckInput => ({
	name,
	url: `https://${name}.example`,
	...(tags === undefined ? {} : { tags }),
});
const none: WorkspaceMonitoring = { checks: [], dashboards: [], statusPages: [], unreadable: [] };
const root = (over: Partial<Monitoring> = {}) =>
	({ checks: [], dashboards: [{ name: "D", tags: ["docs", "sentinel"] }], ...over }) as unknown as Monitoring;

describe("undeclaredCheckRows", () => {
	it("is ok when every check a dashboard picks up is declared", () => {
		const rows = undeclaredCheckRows({
			monitoring: root({ checks: [check("docs", ["docs"])] }),
			workspace: { ...none, checks: [check("sentinel", ["sentinel"])] },
			have: [check("docs", ["docs"]), check("sentinel", ["sentinel"]), check("other", ["x"]), check("bare")],
		});
		expect(rows).toEqual([
			{
				id: "monitoring-undeclared",
				title: "checks no config declares",
				status: "ok",
				detail: "2 compared, all declared",
				problems: [],
			},
		]);
	});

	it("names an undeclared check that carries a dashboard's tag, in name order, as an info row", () => {
		const [row] = undeclaredCheckRows({
			monitoring: root({ checks: [check("docs", ["docs"])] }),
			workspace: none,
			have: [
				check("docs", ["docs"]),
				check("Old relay", ["sentinel", "comlink"]),
				check("Docs staging", ["docs"]),
			],
		});
		expect(row?.status).toBe("skip");
		expect(row?.detail).toBe(
			"info: 2 check(s) a declared dashboard or component picks up, declared nowhere: Docs staging (docs), Old relay (comlink, sentinel)"
		);
	});

	it("does not report a check that carries none of the declared tags", () => {
		const [row] = undeclaredCheckRows({
			monitoring: root(),
			workspace: none,
			have: [check("hand-made", ["x"]), check("bare")],
		});
		expect(row?.status).toBe("ok");
		expect(row?.detail).toBe("0 compared, all declared");
	});

	it("takes the tags of status page components, from the root and the packages", () => {
		const page = (tag: string) => [{ name: "P", slug: "p", components: [{ name: "C", tags: [tag] }] }];
		const [row] = undeclaredCheckRows({
			monitoring: { checks: [], statusPages: page("a") } as unknown as Monitoring,
			workspace: { ...none, statusPages: page("b") },
			have: [check("one", ["a"]), check("two", ["b"])],
		});
		expect(row?.detail).toContain("one (a), two (b)");
	});

	it("is a skip that names the package when a config could not be read", () => {
		const [row] = undeclaredCheckRows({
			monitoring: root(),
			workspace: { ...none, unreadable: ["apps/a: boom", "apps/b: bad"] },
			have: [check("x", ["docs"])],
		});
		expect(row?.status).toBe("skip");
		expect(row?.detail).toBe("info: not compared, a package's config could not be read: apps/a: boom; apps/b: bad");
	});

	it("makes no row when nothing declares a tag, or the checks could not be listed", () => {
		expect(
			undeclaredCheckRows({
				monitoring: { checks: [] } as unknown as Monitoring,
				workspace: none,
				have: [check("x", ["a"])],
			})
		).toEqual([]);
		expect(undeclaredCheckRows({ monitoring: root(), workspace: none, have: undefined })).toEqual([]);
	});
});
