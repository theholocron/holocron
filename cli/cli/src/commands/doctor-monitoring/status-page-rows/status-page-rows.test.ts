import { describe, expect, it } from "vitest";

import {
	MissingTokenError,
	type Monitoring,
	type MonitoringStatusPageInput,
	type MonitoringStatusPageState,
} from "../../../plugin/index.js";
import { statusPageRows } from "./status-page-rows.js";

const PAGE: MonitoringStatusPageInput = {
	name: "The Holocron",
	slug: "theholocron",
	domain: "status.example.dev",
	components: [{ name: "Sentinel", tags: ["sentinel"] }],
};

const GOOD: MonitoringStatusPageState = {
	exists: true,
	public: true,
	domain: "status.example.dev",
	domainVerified: true,
	domainProblems: [],
	missingComponents: [],
	misplacedComponents: [],
	missingRules: [],
	extraComponents: [],
	extraRules: [],
};

const provider = (state: Partial<MonitoringStatusPageState> | Error, page = PAGE) =>
	({
		statusPages: [page],
		inspectStatusPage: async () => {
			if (state instanceof Error) throw state;
			return { ...GOOD, ...state };
		},
	}) as unknown as Monitoring;

describe("statusPageRows", () => {
	it("passes a public, verified page that matches", async () => {
		const rows = await statusPageRows(provider({}));
		expect(rows).toEqual([
			expect.objectContaining({ status: "ok", detail: "public, 1 component(s), domain verified" }),
		]);
	});

	it("fails a page declared private that is public, and the reverse only when stated", async () => {
		const [row] = await statusPageRows(provider({}, { ...PAGE, private: true }));
		expect(row).toMatchObject({ status: "fail", problems: ["declared private but the page is public"] });

		const [stated] = await statusPageRows(provider({ public: false }, { ...PAGE, private: false }));
		expect(stated?.problems).toEqual(["declared public but the page is private"]);

		const [silent] = await statusPageRows(provider({ public: false }));
		expect(silent).toMatchObject({ status: "ok", detail: expect.stringContaining("private") });
	});

	it("fails a missing page", async () => {
		const [row] = await statusPageRows(provider({ exists: false }));
		expect(row?.status).toBe("fail");
	});

	it("lists missing and misplaced components, rules and domain problems", async () => {
		const [row] = await statusPageRows(
			provider({
				missingComponents: ["Comlink"],
				misplacedComponents: ["Sentinel: order 4, expected 0"],
				missingRules: ["Comlink"],
				domainProblems: ["serves no custom domain, declared status.example.dev"],
			})
		);
		expect(row?.status).toBe("fail");
		expect(row?.problems).toHaveLength(4);
		expect(row?.problems[0]).toBe("component Comlink is missing");
	});

	it("fails with a todo for a record still to make", async () => {
		const [row] = await statusPageRows(
			provider({
				domainVerified: false,
				domainRecord: { type: "CNAME", name: "status.example.dev", value: "t.example.net" },
			})
		);
		expect(row?.status).toBe("fail");
		expect(row?.problems[0]).toMatch(/^todo: make CNAME status.example.dev -> t.example.net/);

		const [unnamed] = await statusPageRows(provider({ domainVerified: false }));
		expect(unnamed?.problems[0]).toMatch(/^todo: status.example.dev is not verified/);
	});

	it("reports extras as a skipped info row, not a failure", async () => {
		const rows = await statusPageRows(provider({ extraComponents: ["Old"], extraRules: ["Old rule"] }));
		expect(rows.map((r) => r.status)).toEqual(["ok", "skip"]);
		expect(rows[1]?.detail).toBe("component Old, rule Old rule");
	});

	it("says in a skipped row that incidents are by hand when automation is off", async () => {
		const rows = await statusPageRows(provider({}, { ...PAGE, automation: false }));
		expect(rows.map((r) => [r.id, r.status])).toEqual([
			["monitoring-status-page:The Holocron", "ok"],
			["monitoring-status-page:The Holocron:automation", "skip"],
		]);
		expect(rows[1]?.detail).toMatch(/incidents are opened by hand/);
		expect((await statusPageRows(provider({}, { ...PAGE, automation: true }))).map((r) => r.status)).toEqual([
			"ok",
		]);
	});

	it("skips a provider without inspectStatusPage and fails a thrown error", async () => {
		expect((await statusPageRows({ statusPages: [PAGE] } as unknown as Monitoring))[0]?.status).toBe("skip");
		expect((await statusPageRows(provider(new Error("boom"))))[0]).toMatchObject({
			status: "fail",
			detail: "boom",
		});
		expect(await statusPageRows({} as Monitoring)).toEqual([]);
	});

	it("leaves the domain out of the detail of a page that has none, and calls a private page private", async () => {
		const [row] = await statusPageRows(
			provider({ public: false, domain: undefined, domainVerified: undefined }, { ...PAGE, domain: undefined })
		);
		expect(row).toMatchObject({ status: "ok", detail: "private, 1 component(s)" });
	});

	it("skips with the reason when there is no token for the provider", async () => {
		const [row] = await statusPageRows(provider(new MissingTokenError("checkly")));
		expect(row).toMatchObject({ status: "skip" });
		expect(row?.detail).not.toBe("");
	});
});
