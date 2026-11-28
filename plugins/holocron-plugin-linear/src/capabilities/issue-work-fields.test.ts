import type { IssueRecord } from "@theholocron/cli";
import { describe, expect, it } from "vitest";

import { issue, nodes, scopeWith } from "../test-helpers.js";
import { workFieldsOf } from "./issue-work-fields.js";
import { LinearIssues } from "./issues.js";

type Routes = Parameters<typeof scopeWith>[0];

function make(routes: Routes = []) {
	const s = scopeWith(routes);
	return { ...s, issues: new LinearIssues(s.scope) };
}

const URL_7 = "https://github.com/o/r/issues/7";

const record = (over: Partial<IssueRecord> = {}): IssueRecord => ({
	key: "#7",
	url: URL_7,
	title: "From GitHub",
	body: "text",
	statusCategory: "in-progress",
	closed: false,
	labels: [],
	blockedBy: [],
	comments: [],
	createdAt: "2026-01-01T00:00:00Z",
	updatedAt: "2026-01-02T00:00:00Z",
	...over,
});

describe("workFieldsOf", () => {
	it("reads 1, 3 and 5 as low, medium and high, and the due date as the target date", () => {
		expect(workFieldsOf({ estimate: 1, dueDate: null })).toEqual({ effort: "low" });
		expect(workFieldsOf({ estimate: 3, dueDate: "2026-04-01" })).toEqual({
			effort: "medium",
			targetDate: "2026-04-01",
		});
		expect(workFieldsOf({ estimate: 5, dueDate: "2026-04-01T10:00:00Z" })).toMatchObject({
			effort: "high",
			targetDate: "2026-04-01",
		});
	});

	it("invents nothing for another estimate or none", () => {
		expect(workFieldsOf({ estimate: 2, dueDate: null })).toEqual({});
		expect(workFieldsOf({ estimate: null, dueDate: null })).toEqual({});
	});
});

describe("LinearIssues export, import and sync of Effort and dates (#2496)", () => {
	const importRoutes = (refuseEstimate = false): Routes => [
		[/attachmentsForURL/, { attachmentsForURL: nodes([]) }],
		[/issueLabels\(first/, { issueLabels: nodes([]) }],
		[/users\(first/, { users: nodes([]) }],
		[/issueCreate/, { issueCreate: { issue: issue({ id: "new", identifier: "ENG-50" }) } }],
		[/attachmentLinkURL/, { attachmentLinkURL: { success: true } }],
		[
			/issueUpdate/,
			() => {
				if (refuseEstimate) throw new Error("estimates are off");
				return { issueUpdate: { issue: issue() } };
			},
		],
	];

	it("exports the estimate as effort and the due date as the target date", async () => {
		const { issues } = make([
			[/issue\(id: \$id\) \{ id identifier/, { issue: issue({ estimate: 5, dueDate: "2026-04-01" }) }],
			[/comments\(first/, { issue: { comments: nodes([]) } }],
		]);
		const [r] = await issues.export({ keys: ["ENG-1"] });
		expect(r).toMatchObject({ effort: "high", targetDate: "2026-04-01" });
		expect(r).not.toHaveProperty("startDate");
	});

	it("imports the due date with the issue and the estimate on its own, and drops the start date", async () => {
		const { issues, called } = make(importRoutes());
		const [res] = await issues.import([
			record({ effort: "medium", targetDate: "2026-04-01", startDate: "2026-03-01" }),
		]);
		expect(res?.dropped).toContain("startDate (Linear has no start date)");
		expect(called(/issueCreate/)[0]!.variables.input).toMatchObject({ dueDate: "2026-04-01" });
		expect(called(/issueUpdate/)[0]!.variables.input).toEqual({ estimate: 3 });
	});

	it("reports a team that refuses the estimate as dropped, and makes the issue anyway", async () => {
		const { issues } = make(importRoutes(true));
		const [res] = await issues.import([record({ effort: "low" })]);
		expect(res).toMatchObject({ key: "ENG-50", created: true });
		expect(res?.dropped.join(" ")).toMatch(/effort low \(.*estimates are off\)/);
	});

	it("sets a record with neither field without a call for them", async () => {
		const { issues, called } = make(importRoutes());
		await issues.import([record()]);
		expect(called(/issueUpdate/)).toHaveLength(0);
		expect(called(/issueCreate/)[0]!.variables.input).not.toHaveProperty("dueDate");
	});

	describe("sync", () => {
		const syncRoutes = (current: ReturnType<typeof issue>, refuseEstimate = false): Routes => [
			[
				/attachmentsForURL/,
				(v: Record<string, unknown>) => ({
					attachmentsForURL: nodes([
						{ id: "a", url: v.url, title: "Migrated from", issue: { id: "i1", identifier: "ENG-1" } },
					]),
				}),
			],
			[/issueLabels\(first/, { issueLabels: nodes([]) }],
			[/users\(first/, { users: nodes([]) }],
			[/issue\(id: \$id\) \{ id identifier/, { issue: current }],
			[/comments\(first/, { issue: { comments: nodes([]) } }],
			[
				/issueUpdate/,
				() => {
					if (refuseEstimate) throw new Error("estimates are off");
					return { issueUpdate: { issue: issue() } };
				},
			],
		];
		const inStep = (over: Record<string, unknown> = {}) =>
			issue({
				title: "From GitHub",
				description: "text",
				priority: 0,
				state: { id: "s-prog", name: "In Progress", type: "started" },
				labels: { nodes: [] },
				...over,
			});

		it("sets the estimate and the due date when they differ, and counts them as changes", async () => {
			const { issues, called } = make(syncRoutes(inStep({ estimate: 1, dueDate: "2026-01-01" })));
			const [res] = (await issues.sync?.([record({ effort: "high", targetDate: "2026-04-01" })])) ?? [];
			expect(res).toMatchObject({ updated: true, changes: ["targetDate", "effort"] });
			expect(called(/issueUpdate/).map((c) => c.variables.input)).toEqual([
				{ dueDate: "2026-04-01" },
				{ estimate: 5 },
			]);
		});

		it("leaves them alone when they match, and when the record carries none", async () => {
			const same = make(syncRoutes(inStep({ estimate: 3, dueDate: "2026-04-01T00:00:00.000Z" })));
			const [a] = (await same.issues.sync?.([record({ effort: "medium", targetDate: "2026-04-01" })])) ?? [];
			expect(a).toMatchObject({ updated: false, changes: [] });
			const bare = make(syncRoutes(inStep({ estimate: 3, dueDate: "2026-04-01" })));
			const [b] = (await bare.issues.sync?.([record()])) ?? [];
			expect(b).toMatchObject({ updated: false, changes: [] });
			expect(bare.called(/issueUpdate/)).toHaveLength(0);
		});

		it("only reports them on a dry run, and reports a refused estimate and the start date as dropped", async () => {
			const dry = make(syncRoutes(inStep({ estimate: 1 })));
			const [a] = (await dry.issues.sync?.([record({ effort: "high" })], { dryRun: true })) ?? [];
			expect(a?.changes).toEqual(["effort"]);
			expect(dry.called(/issueUpdate/)).toHaveLength(0);

			const refused = make(syncRoutes(inStep({ estimate: 1 }), true));
			const [b] = (await refused.issues.sync?.([record({ effort: "high", startDate: "2026-03-01" })])) ?? [];
			expect(b?.dropped).toContain("startDate (Linear has no start date)");
			expect(b?.dropped.join(" ")).toMatch(/effort high \(.*estimates are off\)/);
		});
	});
});
