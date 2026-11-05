import type { BoardSummary, BoardTemplate } from "@theholocron/cli";
import { describe, expect, it, vi } from "vitest";

import { createGitHubClient } from "../rest.js";
import { GitHubProjects } from "./projects.js";

const REPO = "theholocron/holocron";
const BOARD: BoardSummary = { id: "P1", number: 1, name: "v5", url: "https://x/1", closed: false };
const OTHER: BoardSummary = { id: "P2", number: 2, name: "v6", url: "https://x/2", closed: false };

interface Call {
	query: string;
	variables: Record<string, unknown>;
}

type Reply = Record<string, unknown> | ((variables: Record<string, unknown>, call: number) => unknown);

/** A GraphQL endpoint answering by a substring of the query; every call is recorded. */
function endpoint(routes: Array<[string, Reply]>) {
	const calls: Call[] = [];
	const counts = new Map<string, number>();
	const fetch = vi.fn(async (_url: string | URL, init?: RequestInit) => {
		const body = JSON.parse(String(init?.body)) as Call;
		calls.push(body);
		const route = routes.find(([needle]) => body.query.includes(needle));
		if (!route) return new Response(JSON.stringify({ errors: [{ message: `unrouted: ${body.query}` }] }));
		const n = (counts.get(route[0]) ?? 0) + 1;
		counts.set(route[0], n);
		const reply = typeof route[1] === "function" ? route[1](body.variables ?? {}, n) : route[1];
		return new Response(JSON.stringify({ data: reply }));
	});
	const client = createGitHubClient({ token: "t", fetch: fetch as unknown as typeof globalThis.fetch });
	return { projects: new GitHubProjects(client.graphql, { repo: REPO }), calls };
}

const opt = (id: string, name: string, color = "GRAY", description = "") => ({ id, name, color, description });

function boardNode(overrides: Record<string, unknown> = {}) {
	return {
		node: {
			id: "P1",
			number: 1,
			title: "v5",
			closed: false,
			url: "https://x/1",
			fields: {
				nodes: [
					{ id: "F0", name: "Title", dataType: "TITLE" },
					{
						id: "FS",
						name: "Status",
						dataType: "SINGLE_SELECT",
						options: [opt("o1", "Todo", "GREEN", "d1"), opt("o2", "Done", "PURPLE")],
					},
					{
						id: "FP",
						name: "Priority",
						dataType: "SINGLE_SELECT",
						options: [opt("p1", "P0", "RED"), opt("p2", "P1")],
					},
					{ id: "FN", name: "Estimate", dataType: "NUMBER" },
					{},
				],
			},
			views: {
				nodes: [
					{
						id: "V1",
						name: "Board",
						layout: "BOARD_LAYOUT",
						filter: "-status:Done",
						groupByFields: { nodes: [{ name: "Status" }] },
					},
					{ id: "V2", name: "Table", layout: "TABLE_LAYOUT", filter: null },
					{ id: "V3", name: "Roadmap", layout: "ROADMAP_LAYOUT", filter: null, groupByFields: { nodes: [] } },
				],
			},
			workflows: {
				nodes: [
					{ id: "W1", name: "Item closed", enabled: true },
					{ id: "W2", name: "Auto-add", enabled: false },
				],
			},
			...overrides,
		},
	};
}

const TEMPLATE: BoardTemplate = {
	name: "roadmap",
	statuses: [
		{ name: "Todo", category: "planned" },
		{ name: "Blocked", category: "blocked", color: "red", description: "waiting" },
		{ name: "Done", category: "done" },
	],
	fields: [],
	views: [],
};

function item(
	id: string,
	number: number,
	state: string,
	values: Record<string, string>,
	extra: Record<string, unknown> = {},
	repo = REPO
) {
	return {
		id,
		fieldValues: {
			nodes: [{}, ...Object.entries(values).map(([field, name]) => ({ name, field: { name: field } }))],
		},
		content: {
			id: `C${number}`,
			number,
			title: `Issue ${number}`,
			state,
			repository: { nameWithOwner: repo },
			...extra,
		},
	};
}

const page = (nodes: unknown[], hasNextPage = false) => ({
	node: { items: { pageInfo: { hasNextPage, endCursor: hasNextPage ? "cur" : null }, nodes } },
});

describe("GitHubProjects boards", () => {
	const project = (n: number, title: string, closed: boolean) => ({
		id: `P${n}`,
		number: n,
		title,
		closed,
		url: `https://x/${n}`,
	});

	it("list pages through open and closed projects; find takes the exact open name", async () => {
		const { projects, calls } = endpoint([
			[
				"projectsV2",
				(v) =>
					v.after === null
						? {
								organization: {
									id: "O",
									projectsV2: {
										pageInfo: { hasNextPage: true, endCursor: "c1" },
										nodes: [project(1, "v4", true), project(2, "v5", false)],
									},
								},
							}
						: {
								organization: {
									id: "O",
									projectsV2: {
										pageInfo: { hasNextPage: false, endCursor: null },
										nodes: [project(3, "v5", true)],
									},
								},
							},
			],
		]);
		expect(await projects.list("org")).toHaveLength(3);
		expect(calls[1]?.variables.after).toBe("c1");
		expect((await projects.find("org", "v5"))?.number).toBe(2);
		expect(await projects.find("org", "v4")).toBeUndefined();
	});

	it("create copies the source board when the template names one, with no items", async () => {
		const { projects, calls } = endpoint([
			["query($owner: String!) { organization", { organization: { id: "O" } }],
			[
				"projectsV2(first",
				{
					organization: {
						id: "O",
						projectsV2: {
							pageInfo: { hasNextPage: false, endCursor: null },
							nodes: [project(5, "base", false)],
						},
					},
				},
			],
			["copyProjectV2", { copyProjectV2: { projectV2: project(9, "v6", false) } }],
		]);
		const board = await projects.create("org", "v6", { ...TEMPLATE, source: "base" });
		expect(board).toMatchObject({ id: "P9", number: 9, name: "v6", closed: false });
		const copy = calls.find((c) => c.query.includes("copyProjectV2"));
		expect(copy?.variables).toEqual({ project: "P5", owner: "O", title: "v6" });
		expect(copy?.query).toContain("includeDraftIssues: false");
		expect(calls.some((c) => c.query.includes("createProjectV2("))).toBe(false);
	});

	it("create makes a board and applies the template when there is no source (or it is missing)", async () => {
		const { projects, calls } = endpoint([
			["query($owner: String!) { organization", { organization: { id: "O" } }],
			[
				"projectsV2(first",
				{ organization: { id: "O", projectsV2: { pageInfo: { hasNextPage: false }, nodes: [] } } },
			],
			["createProjectV2(", { createProjectV2: { projectV2: project(7, "v7", false) } }],
			["query($id: ID!) { node", boardNode()],
			["items(first", page([])],
			["updateProjectV2Field", {}],
		]);
		const board = await projects.create("org", "v7", { ...TEMPLATE, source: "gone" });
		expect(board.id).toBe("P7");
		expect(calls.some((c) => c.query.includes("updateProjectV2Field"))).toBe(true);
	});

	it("create makes a board straight away when the template names no source", async () => {
		const { projects, calls } = endpoint([
			["query($owner: String!) { organization", { organization: { id: "O" } }],
			["createProjectV2(", { createProjectV2: { projectV2: project(8, "v8", false) } }],
			["query($id: ID!) { node", boardNode()],
			["items(first", page([])],
			["updateProjectV2Field", {}],
		]);
		const board = await projects.create("org", "v8", TEMPLATE);
		expect(board.id).toBe("P8");
		expect(calls.some((c) => c.query.includes("projectsV2(first"))).toBe(false);
	});

	it("close sets closed on the project", async () => {
		const { projects, calls } = endpoint([["updateProjectV2(", {}]]);
		await projects.close("org", BOARD);
		expect(calls[0]?.query).toContain("closed: true");
		expect(calls[0]?.variables).toEqual({ project: "P1" });
	});

	it("whoami counts boards and reports a failure as not ok", async () => {
		const ok = endpoint([
			[
				"projectsV2",
				{
					organization: {
						id: "O",
						projectsV2: { pageInfo: { hasNextPage: false }, nodes: [project(1, "a", false)] },
					},
				},
			],
		]);
		expect(await ok.projects.whoami()).toEqual({ ok: true, boards: 1 });
		const bad = endpoint([]);
		expect(await bad.projects.whoami()).toEqual({ ok: false, boards: 0 });
	});
});

describe("GitHubProjects.read", () => {
	it("maps statuses, other fields, board and table views and rules; built-in fields and roadmap views are left out", async () => {
		const { projects } = endpoint([["query($id: ID!) { node", boardNode()]]);
		const state = await projects.read("org", BOARD);
		expect(state.statuses).toEqual(["Todo", "Done"]);
		expect(state.fields).toEqual([
			{ name: "Priority", type: "single_select", options: ["P0", "P1"] },
			{ name: "Estimate", type: "number" },
		]);
		expect(state.views).toEqual([
			{ name: "Board", layout: "board", filter: "-status:Done", groupBy: "Status" },
			{ name: "Table", layout: "table" },
		]);
		expect(state.rules).toEqual([
			{ name: "Item closed", enabled: true },
			{ name: "Auto-add", enabled: false },
		]);
	});

	it("reads no statuses from a board that has no Status field", async () => {
		const { projects } = endpoint([
			[
				"query($id: ID!) { node",
				boardNode({ fields: { nodes: [{ id: "F0", name: "Title", dataType: "TITLE" }] } }),
			],
		]);
		expect((await projects.read("org", BOARD)).statuses).toEqual([]);
	});

	it("throws when the board is gone", async () => {
		const { projects } = endpoint([["query($id: ID!) { node", { node: null }]]);
		await expect(projects.read("org", BOARD)).rejects.toThrow(/not found/);
	});
});

describe("GitHubProjects.ensure", () => {
	const afterWrite = boardNode({
		fields: {
			nodes: [
				{
					id: "FS",
					name: "Status",
					dataType: "SINGLE_SELECT",
					options: [opt("o1", "Todo"), opt("n9", "Blocked"), opt("o2", "Done")],
				},
			],
		},
	});

	it("sends every existing option with its id, in template order, and adds the new one without", async () => {
		let reads = 0;
		const { projects, calls } = endpoint([
			["query($id: ID!) { node", () => (++reads === 1 ? boardNode() : afterWrite)],
			["items(first", page([item("I1", 1, "OPEN", { Status: "Todo" })])],
			["updateProjectV2Field", {}],
		]);
		const report = await projects.ensure("org", BOARD, TEMPLATE);
		const write = calls.find((c) => c.query.includes("updateProjectV2Field"));
		expect(write?.variables.field).toBe("FS");
		expect(write?.variables.options).toEqual([
			{ id: "o1", name: "Todo", color: "GREEN", description: "d1" },
			{ name: "Blocked", color: "RED", description: "waiting" },
			{ id: "o2", name: "Done", color: "PURPLE", description: "" },
		]);
		expect(report.changes).toContain("status Blocked added");
		expect(report.created).toBe(false);
	});

	it("keeps options the template does not mention, after the wanted ones, with their ids", async () => {
		const { projects, calls } = endpoint([
			["query($id: ID!) { node", boardNode()],
			["items(first", page([])],
			["updateProjectV2Field", {}],
		]);
		const report = await projects.ensure("org", BOARD, {
			...TEMPLATE,
			statuses: [{ name: "Done", category: "done" }],
		});
		const write = calls.find((c) => c.query.includes("updateProjectV2Field"));
		expect((write?.variables.options as Array<{ id?: string }>).map((o) => o.id)).toEqual(["o2", "o1"]);
		expect(report.changes).toEqual(["status order set"]);
	});

	it("updates an existing status whose color changed and leaves its description alone", async () => {
		const { projects, calls } = endpoint([
			["query($id: ID!) { node", boardNode()],
			["items(first", page([])],
			["updateProjectV2Field", {}],
		]);
		const report = await projects.ensure("org", BOARD, {
			...TEMPLATE,
			statuses: [
				{ name: "Todo", category: "planned", color: "blue" },
				{ name: "Done", category: "done" },
			],
		});
		expect(report.changes).toEqual(["status Todo updated"]);
		const write = calls.find((c) => c.query.includes("updateProjectV2Field"));
		expect(write?.variables.options).toEqual([
			{ id: "o1", name: "Todo", color: "BLUE", description: "d1" },
			{ id: "o2", name: "Done", color: "PURPLE", description: "" },
		]);
	});

	it("creates a single select field with an empty option list when the template gives none", async () => {
		const { projects, calls } = endpoint([
			["query($id: ID!) { node", boardNode()],
			["createProjectV2Field", {}],
			["items(first", page([])],
			["updateProjectV2Field", {}],
		]);
		await projects.ensure("org", BOARD, {
			...TEMPLATE,
			statuses: [
				{ name: "Todo", category: "planned" },
				{ name: "Done", category: "done" },
			],
			fields: [{ name: "Area", type: "single_select" }],
		});
		const created = calls.find((c) => c.query.includes("createProjectV2Field"));
		expect(created?.variables.options).toEqual([]);
	});

	it("leaves an existing single select alone when the template lists no options for it", async () => {
		const { projects, calls } = endpoint([["query($id: ID!) { node", boardNode()]]);
		const report = await projects.ensure("org", BOARD, {
			...TEMPLATE,
			statuses: [
				{ name: "Todo", category: "planned" },
				{ name: "Done", category: "done" },
			],
			fields: [{ name: "Priority", type: "single_select" }],
		});
		expect(report).toEqual({ created: false, changes: [], todos: [] });
		expect(calls).toHaveLength(1);
	});

	it("writes nothing when the board already matches", async () => {
		const { projects, calls } = endpoint([["query($id: ID!) { node", boardNode()]]);
		const report = await projects.ensure("org", BOARD, {
			...TEMPLATE,
			statuses: [
				{ name: "Todo", category: "planned" },
				{ name: "Done", category: "done" },
			],
			fields: [{ name: "Priority", type: "single_select", options: ["P0", "P1"] }],
			views: [{ name: "Board", layout: "board", filter: "-status:Done", groupBy: "Status" }],
			rules: ["Item closed"],
		});
		expect(report).toEqual({ created: false, changes: [], todos: [] });
		expect(calls).toHaveLength(1);
	});

	it("stops before any write when the status field cannot be read", async () => {
		const { projects, calls } = endpoint([
			[
				"query($id: ID!) { node",
				boardNode({ fields: { nodes: [{ id: "F0", name: "Title", dataType: "TITLE" }] } }),
			],
		]);
		await expect(projects.ensure("org", BOARD, TEMPLATE)).rejects.toThrow(/cannot read the "Status" field/);
		expect(calls).toHaveLength(1);
	});

	it("writes values back by option name when a re-read shows them gone, and fails", async () => {
		let reads = 0;
		let itemReads = 0;
		const { projects, calls } = endpoint([
			["query($id: ID!) { node", () => (++reads === 1 ? boardNode() : afterWrite)],
			[
				"items(first",
				() =>
					++itemReads === 1
						? page([
								item("I1", 1, "OPEN", { Status: "Todo" }),
								item("I2", 2, "OPEN", { Status: "Gone" }),
								item("I3", 3, "OPEN", {}),
							])
						: page([item("I1", 1, "OPEN", {}), item("I2", 2, "OPEN", {}), item("I3", 3, "OPEN", {})]),
			],
			["updateProjectV2Field", {}],
			["updateProjectV2ItemFieldValue", {}],
		]);
		await expect(projects.ensure("org", BOARD, TEMPLATE)).rejects.toThrow(
			/blanked 2 item value\(s\); wrote 1 back/
		);
		const restore = calls.filter((c) => c.query.includes("updateProjectV2ItemFieldValue"));
		expect(restore).toHaveLength(1);
		expect(restore[0]?.variables).toMatchObject({ item: "I1", option: "o1" });
	});

	it("creates missing fields and views, updates a changed layout and filter, and lists what the API cannot do", async () => {
		const { projects, calls } = endpoint([
			["query($id: ID!) { node", boardNode()],
			["createProjectV2Field", {}],
			["createProjectV2View", { createProjectV2View: { projectV2View: { id: "V9" } } }],
			["updateProjectV2View", {}],
			["items(first", page([])],
			["updateProjectV2Field", {}],
		]);
		const report = await projects.ensure("org", BOARD, {
			name: "t",
			statuses: [
				{ name: "Todo", category: "planned", color: "GREEN", description: "d1" },
				{ name: "Done", category: "done", color: "PURPLE" },
			],
			fields: [
				{ name: "Area", type: "single_select", options: ["web", "cli"] },
				{ name: "Due", type: "date" },
				{ name: "Estimate", type: "text" },
				{ name: "Priority", type: "single_select", options: ["P0", "P1", "P2"] },
			],
			views: [
				{ name: "Board", layout: "table", filter: "is:open", groupBy: "Priority" },
				{ name: "Fresh", layout: "board", filter: "label:x" },
			],
			rules: ["Item closed", "Auto-add", "Missing rule"],
		});
		const created = calls.filter((c) => c.query.includes("createProjectV2Field"));
		expect(created.map((c) => c.variables.type)).toEqual(["SINGLE_SELECT", "DATE"]);
		expect(created[0]?.variables.options).toEqual([
			{ name: "web", color: "GRAY", description: "" },
			{ name: "cli", color: "GRAY", description: "" },
		]);
		expect(created[1]?.variables.options).toBeUndefined();
		const optionWrite = calls.find((c) => c.query.includes("updateProjectV2Field"));
		expect((optionWrite?.variables.options as Array<{ id?: string }>).slice(0, 2).map((o) => o.id)).toEqual([
			"p1",
			"p2",
		]);
		expect(calls.find((c) => c.query.includes("createProjectV2View"))?.variables).toMatchObject({
			name: "Fresh",
			layout: "BOARD_LAYOUT",
		});
		const updates = calls.filter((c) => c.query.includes("updateProjectV2View")).map((c) => c.variables);
		expect(updates).toEqual([
			{ view: "V1", layout: "TABLE_LAYOUT" },
			{ view: "V1", filter: "is:open" },
			{ view: "V9", filter: "label:x" },
		]);
		expect(report.changes).toEqual(
			expect.arrayContaining([
				"field Area created",
				"field Due created",
				"field Priority option P2 added",
				"view Fresh created",
				"view Board layout set to table",
				"view Board filter set",
			])
		);
		expect(report.todos).toEqual([
			expect.stringContaining('field "Estimate" is NUMBER'),
			expect.stringContaining('group view "Board" by Priority'),
			expect.stringContaining('turn on the automation rule "Auto-add"'),
			expect.stringContaining('create the automation rule "Missing rule"'),
		]);
	});
});

describe("GitHubProjects items and setStatus", () => {
	const blocker = (number: number, state: string, repo = REPO) => ({
		number,
		state,
		repository: { nameWithOwner: repo },
	});
	const content = [
		item(
			"I1",
			1,
			"OPEN",
			{ Status: "Todo" },
			{ blockedBy: { nodes: [blocker(5, "OPEN"), blocker(6, "CLOSED"), blocker(7, "OPEN", "o/r")] } }
		),
		item("I2", 2, "CLOSED", { Status: "Done" }, {}, "o/r"),
		item("I3", 3, "MERGED", {}),
		{ id: "I4", fieldValues: { nodes: [] }, content: null },
	];

	it("items keys by repo, maps categories and keeps only open blockers; pages", async () => {
		const { projects, calls } = endpoint([
			[
				"query($id: ID!, $after",
				(v) => (v.after === null ? page(content.slice(0, 1), true) : page(content.slice(1))),
			],
		]);
		const items = await projects.items("org", BOARD, TEMPLATE);
		expect(calls).toHaveLength(2);
		expect(items).toEqual([
			{
				key: "#1",
				title: "Issue 1",
				open: true,
				status: "Todo",
				category: "planned",
				blockedBy: ["#5", "o/r#7"],
			},
			{ key: "o/r#2", title: "Issue 2", open: false, status: "Done", category: "done", blockedBy: [] },
			{ key: "#3", title: "Issue 3", open: false, blockedBy: [] },
		]);
	});

	it("setStatus writes the option, and is a no-op when the item is already there", async () => {
		const { projects, calls } = endpoint([
			["query($id: ID!) { node", boardNode()],
			["items(first", page(content)],
			["updateProjectV2ItemFieldValue", {}],
		]);
		expect(await projects.setStatus("org", BOARD, "#1", "Todo")).toEqual({ transitioned: false, status: "Todo" });
		expect(calls.some((c) => c.query.includes("updateProjectV2ItemFieldValue"))).toBe(false);
		expect(await projects.setStatus("org", BOARD, "o/r#2", "Todo")).toMatchObject({
			transitioned: true,
			status: "Todo",
		});
		const write = calls.find((c) => c.query.includes("updateProjectV2ItemFieldValue"));
		expect(write?.variables).toEqual({ project: "P1", item: "I2", field: "FS", option: "o1" });
		expect((await projects.setStatus("org", BOARD, "3", "Done")).transitioned).toBe(true);
	});

	it("setStatus refuses an unknown status, an item not on the board and a bad key", async () => {
		const { projects } = endpoint([
			["query($id: ID!) { node", boardNode()],
			["items(first", page(content)],
		]);
		await expect(projects.setStatus("org", BOARD, "#1", "Nope")).rejects.toThrow(/no status "Nope"/);
		await expect(projects.setStatus("org", BOARD, "#99", "Todo")).rejects.toThrow(/not on board/);
		await expect(projects.setStatus("org", BOARD, "abc", "Todo")).rejects.toThrow(/not an issue key/);
	});
});

describe("GitHubProjects.move", () => {
	it("moves open items with status and priority, keeps those on the target, leaves closed ones and sets them done", async () => {
		const sourceItems = [
			item("S1", 1, "OPEN", { Status: "Todo", Priority: "P0" }),
			item("S2", 2, "OPEN", { Status: "Todo", Priority: "P1" }),
			item("S3", 3, "CLOSED", { Status: "Todo" }),
			item("S4", 4, "MERGED", { Status: "Done" }),
			item("S5", 5, "CLOSED", {}),
		];
		const targetItems = [item("T2", 2, "OPEN", { Status: "Done" })];
		const { projects, calls } = endpoint([
			["query($id: ID!) { node", (_v) => boardNode()],
			["items(first", (v) => (v.id === "P1" ? page(sourceItems) : page(targetItems))],
			["addProjectV2ItemById", { addProjectV2ItemById: { item: { id: "T1" } } }],
			["updateProjectV2ItemFieldValue", {}],
		]);
		const report = await projects.move("org", BOARD, OTHER, TEMPLATE);
		expect(report).toEqual({ moved: ["#1"], kept: ["#2"], left: ["#3", "#4", "#5"] });
		const added = calls.filter((c) => c.query.includes("addProjectV2ItemById"));
		expect(added).toHaveLength(1);
		expect(added[0]?.variables).toEqual({ project: "P2", content: "C1" });
		const writes = calls
			.filter((c) => c.query.includes("updateProjectV2ItemFieldValue"))
			.map((c) => [c.variables.project, c.variables.item, c.variables.field, c.variables.option]);
		expect(writes).toEqual([
			["P2", "T1", "FS", "o1"],
			["P2", "T1", "FP", "p1"],
			["P2", "T2", "FP", "p2"],
			["P1", "S3", "FS", "o2"],
			["P1", "S5", "FS", "o2"],
		]);
	});

	it("skips a value whose option the target lacks, and sets no done status when the template has none", async () => {
		const { projects, calls } = endpoint([
			["query($id: ID!) { node", boardNode()],
			[
				"items(first",
				(v) =>
					v.id === "P1"
						? page([item("S1", 1, "OPEN", { Status: "Ghost" }), item("S2", 2, "CLOSED", {})])
						: page([]),
			],
			["addProjectV2ItemById", { addProjectV2ItemById: { item: { id: "T1" } } }],
		]);
		const report = await projects.move("org", BOARD, OTHER, {
			...TEMPLATE,
			statuses: [{ name: "Todo", category: "planned" }],
		});
		expect(report).toEqual({ moved: ["#1"], kept: [], left: ["#2"] });
		expect(calls.some((c) => c.query.includes("updateProjectV2ItemFieldValue"))).toBe(false);
	});
});
