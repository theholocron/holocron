import { describe, expect, it } from "vitest";

import type { BoardItem, BoardTemplate } from "../../../plugin/index.js";
import { ROADMAP_TEMPLATE } from "../templates/roadmap/index.js";
import { planReconcile } from "./plan-reconcile.js";

const item = (over: Partial<BoardItem> & { key: string }): BoardItem => ({
	title: `title ${over.key}`,
	open: true,
	blockedBy: [],
	...over,
});

describe("planReconcile", () => {
	const rows: Array<[string, BoardItem, { to: string; reason: string } | "none"]> = [
		[
			"open, open blocker, Todo",
			item({ key: "#1", status: "Todo", blockedBy: ["#9"] }),
			{ to: "Blocked", reason: "blocked" },
		],
		[
			"open, open blocker, In Progress",
			item({ key: "#2", status: "In Progress", blockedBy: ["#9"] }),
			{ to: "Blocked", reason: "blocked" },
		],
		["open, open blocker, already Blocked", item({ key: "#3", status: "Blocked", blockedBy: ["#9"] }), "none"],
		["open, Blocked, no blocker", item({ key: "#4", status: "Blocked" }), { to: "Todo", reason: "unblocked" }],
		["open, Todo, no blocker", item({ key: "#5", status: "Todo" }), "none"],
		["open, In Progress, no blocker", item({ key: "#6", status: "In Progress" }), "none"],
		["closed in Todo", item({ key: "#7", status: "Todo", open: false }), { to: "Done", reason: "closed" }],
		[
			"closed in Blocked with no blocker",
			item({ key: "#8", status: "Blocked", open: false }),
			{ to: "Done", reason: "closed" },
		],
		["closed with no status", item({ key: "#10", open: false }), { to: "Done", reason: "closed" }],
		["closed already Done", item({ key: "#11", status: "Done", open: false }), "none"],
	];

	it.each(rows)("%s", (_name, input, expected) => {
		const plan = planReconcile([input], ROADMAP_TEMPLATE);
		const want = expected === "none" ? [] : [{ key: input.key, to: expected.to, reason: expected.reason }];
		expect(plan.changes.map(({ key, to, reason }) => ({ key, to, reason }))).toEqual(want);
		expect(plan.unresolved).toEqual([]);
	});

	it("records the status an item leaves, and none for an item without one", () => {
		const [a] = planReconcile([item({ key: "#1", status: "Todo", blockedBy: ["#9"] })], ROADMAP_TEMPLATE).changes;
		const [b] = planReconcile([item({ key: "#2", open: false })], ROADMAP_TEMPLATE).changes;
		expect(a).toMatchObject({ from: "Todo", category: "blocked" });
		expect(b).not.toHaveProperty("from");
	});

	it("reports an open item with no status and does not set it, even with a blocker", () => {
		const bare = item({ key: "#1" });
		const blocked = item({ key: "#2", blockedBy: ["#9"] });
		const plan = planReconcile([bare, blocked], ROADMAP_TEMPLATE);
		expect(plan.changes).toEqual([]);
		expect(plan.unset).toEqual([bare, blocked]);
	});

	it("reads the category from the template by status name, then from the item", () => {
		// The provider's category is wrong; the template wins.
		const wrong = item({ key: "#1", status: "Blocked", category: "active", blockedBy: ["#9"] });
		expect(planReconcile([wrong], ROADMAP_TEMPLATE).changes).toEqual([]);
		// A status the template does not know falls back to the item's category.
		const foreign = item({ key: "#2", status: "Waiting", category: "blocked" });
		expect(planReconcile([foreign], ROADMAP_TEMPLATE).changes[0]).toMatchObject({ to: "Todo" });
		const foreignDone = item({ key: "#3", status: "Shipped", category: "done", open: false });
		expect(planReconcile([foreignDone], ROADMAP_TEMPLATE).changes).toEqual([]);
	});

	it("picks the first status of a category in template order", () => {
		const template: BoardTemplate = {
			name: "tied",
			statuses: [
				{ name: "Icebox", category: "backlog" },
				{ name: "Next", category: "planned" },
				{ name: "Later", category: "planned" },
				{ name: "Stuck", category: "blocked" },
				{ name: "Waiting", category: "blocked" },
				{ name: "Shipped", category: "done" },
				{ name: "Dropped", category: "done" },
			],
			fields: [],
			views: [],
		};
		const plan = planReconcile(
			[
				item({ key: "#1", status: "Next", blockedBy: ["#9"] }),
				item({ key: "#2", status: "Waiting" }),
				item({ key: "#3", status: "Next", open: false }),
			],
			template
		);
		expect(plan.changes.map((c) => c.to)).toEqual(["Stuck", "Next", "Shipped"]);
		// "Waiting" is a blocked status and "Dropped" a done one: neither is touched when already right.
		expect(planReconcile([item({ key: "#4", status: "Waiting", blockedBy: ["#9"] })], template).changes).toEqual(
			[]
		);
		expect(planReconcile([item({ key: "#5", status: "Dropped", open: false })], template).changes).toEqual([]);
	});

	it("reports, and does not guess, when the template has no status of the wanted category", () => {
		const template: BoardTemplate = {
			name: "bare",
			statuses: [{ name: "Todo", category: "planned" }],
			fields: [],
			views: [],
		};
		const plan = planReconcile(
			[
				item({ key: "#1", status: "Todo", blockedBy: ["#9"] }),
				item({ key: "#2", status: "Todo", open: false }),
				item({ key: "#3", status: "Todo" }),
			],
			template
		);
		expect(plan.changes).toEqual([]);
		expect(plan.unresolved).toEqual([
			{ key: "#1", title: "title #1", category: "blocked", reason: "blocked" },
			{ key: "#2", title: "title #2", category: "done", reason: "closed" },
		]);
	});

	it("has no unblocked target when the template lacks a planned status", () => {
		const template: BoardTemplate = {
			name: "no-planned",
			statuses: [
				{ name: "Stuck", category: "blocked" },
				{ name: "Shipped", category: "done" },
			],
			fields: [],
			views: [],
		};
		const plan = planReconcile([item({ key: "#1", status: "Stuck" })], template);
		expect(plan.unresolved).toEqual([{ key: "#1", title: "title #1", category: "planned", reason: "unblocked" }]);
	});

	it("is idempotent: planning the result of a plan gives no change", () => {
		const items = [
			item({ key: "#1", status: "Todo", blockedBy: ["#9"] }),
			item({ key: "#2", status: "Blocked" }),
			item({ key: "#3", status: "In Progress", open: false }),
			item({ key: "#4", open: false }),
			item({ key: "#5", status: "Todo" }),
		];
		const first = planReconcile(items, ROADMAP_TEMPLATE);
		const applied = items.map((i) => {
			const change = first.changes.find((c) => c.key === i.key);
			return change ? { ...i, status: change.to, category: change.category } : i;
		});
		expect(first.changes).toHaveLength(4);
		expect(planReconcile(applied, ROADMAP_TEMPLATE).changes).toEqual([]);
	});

	it("keeps the order of the items and handles an empty board", () => {
		expect(planReconcile([], ROADMAP_TEMPLATE)).toEqual({ changes: [], unset: [], unresolved: [] });
		const plan = planReconcile(
			[item({ key: "#b", open: false }), item({ key: "#a", status: "Blocked" })],
			ROADMAP_TEMPLATE
		);
		expect(plan.changes.map((c) => c.key)).toEqual(["#b", "#a"]);
	});
});
