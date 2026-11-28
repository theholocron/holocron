import type { IssueRecord } from "@theholocron/cli";
import { describe, expect, it } from "vitest";

import { issue, nodes, scopeWith } from "../test-helpers.js";
import { kindOfLabels, labelsFor } from "./issue-kind.js";
import { LinearIssues } from "./issues.js";

const URL_7 = "https://github.com/o/r/issues/7";

type Routes = Parameters<typeof scopeWith>[0];

function make(routes: Routes = []) {
	const s = scopeWith(routes);
	return { ...s, issues: new LinearIssues(s.scope) };
}

const record = (over: Partial<IssueRecord> = {}): IssueRecord => ({
	key: "#7",
	url: URL_7,
	title: "From GitHub",
	statusCategory: "open",
	closed: false,
	labels: [],
	blockedBy: [],
	comments: [],
	createdAt: "2026-01-01T00:00:00Z",
	updatedAt: "2026-01-02T00:00:00Z",
	...over,
});

const commonRoutes: Routes = [
	[/issueLabels\(first/, { issueLabels: nodes([{ id: "l1", name: "bug", color: "#f00", team: null }]) }],
	[
		/issueLabelCreate/,
		(v: Record<string, unknown>) => ({
			issueLabelCreate: { issueLabel: { id: `new-${(v.input as { name: string }).name}`, name: "x" } },
		}),
	],
	[/users\(first/, { users: nodes([]) }],
	[/issueUpdate/, { issueUpdate: { issue: issue() } }],
	[/comments\(first/, { issue: { comments: nodes([]) } }],
];

describe("the kind label of a Linear issue (#2485)", () => {
	it("reads the one kind the labels name, and none for two kinds, another label or no label", () => {
		expect(kindOfLabels(["Bug", "x"])).toBe("bug");
		expect(kindOfLabels(["enhancement"])).toBe("feature");
		expect(kindOfLabels(["chore"])).toBe("task");
		expect(kindOfLabels(["bug", "chore"])).toBeUndefined();
		expect(kindOfLabels(["other"])).toBeUndefined();
		expect(kindOfLabels([])).toBeUndefined();
	});

	it("adds the kind's label to a record's labels only when they do not name it already", () => {
		expect(labelsFor({ labels: ["a"] })).toEqual(["a"]);
		expect(labelsFor({ labels: ["a"], kind: "feature" })).toEqual(["a", "enhancement"]);
		expect(labelsFor({ labels: ["Bug"], kind: "bug" })).toEqual(["Bug"]);
	});

	it("exports the kind from the label, and none when the labels name two", async () => {
		const routes = (names: string[]): Routes => [
			[
				/issue\(id: \$id\) \{ id identifier/,
				{ issue: issue({ labels: { nodes: names.map((name, i) => ({ id: `l${i}`, name })) } }) },
			],
			[/comments\(first/, { issue: { comments: nodes([]) } }],
		];
		const [one] = await make(routes(["bug", "x"])).issues.export({ keys: ["ENG-1"] });
		expect(one).toMatchObject({ kind: "bug", labels: ["bug", "x"] });
		const [two] = await make(routes(["bug", "chore"])).issues.export({ keys: ["ENG-1"] });
		expect(two?.kind).toBeUndefined();
	});

	it("writes the kind as its label on import, making the label when the team lacks it", async () => {
		const { issues, called } = make([
			[/attachmentsForURL/, { attachmentsForURL: nodes([]) }],
			[/issueCreate/, { issueCreate: { issue: issue({ id: "new", identifier: "ENG-50" }) } }],
			[/attachmentLinkURL/, { attachmentLinkURL: { success: true } }],
			...commonRoutes,
		]);
		await issues.import([record({ kind: "task" }), record({ key: "#8", url: "https://x/8", kind: "bug" })]);
		const inputs = called(/issueCreate/).map((c) => c.variables.input as { labelIds: string[] });
		expect(inputs[0]?.labelIds).toEqual(["new-chore"]);
		expect(inputs[1]?.labelIds).toEqual(["l1"]);
	});

	it("sync sets an issue's labels to include the kind label, and leaves one that already has it", async () => {
		const syncRoutes = (labels: string[]): Routes => [
			[
				/attachmentsForURL/,
				{
					attachmentsForURL: nodes([
						{ id: "a", url: URL_7, title: "Migrated from", issue: { id: "i1", identifier: "ENG-1" } },
					]),
				},
			],
			[
				/issue\(id: \$id\) \{ id identifier/,
				{ issue: issue({ labels: { nodes: labels.map((name, i) => ({ id: `l${i}`, name })) } }) },
			],
			...commonRoutes,
		];
		const differs = make(syncRoutes(["bug"]));
		const [res] = (await differs.issues.sync?.([record({ kind: "task" })])) ?? [];
		expect(res?.changes).toContain("labels");
		expect((differs.called(/issueUpdate/)[0]!.variables.input as { labelIds: string[] }).labelIds).toEqual([
			"new-chore",
		]);

		const same = make(syncRoutes(["bug"]));
		const [kept] = (await same.issues.sync?.([record({ kind: "bug" })])) ?? [];
		expect(kept?.changes).not.toContain("labels");
	});
});
