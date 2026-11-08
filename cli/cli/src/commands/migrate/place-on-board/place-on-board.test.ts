import { describe, expect, it, vi } from "vitest";

import type { AddedItem, BoardSummary, BoardTemplate, ImportResult } from "../../../plugin/index.js";
import { record } from "../migrate.testing.js";
import { placeOnBoard } from "./place-on-board.js";
import type { BoardWriter } from "./place-on-board.type.js";

const BOARD: BoardSummary = { id: "B", number: 5, name: "v5", url: "https://x/5", closed: false };
const TEMPLATE: BoardTemplate = { name: "roadmap", statuses: [], fields: [], views: [] };

const result = (source: string, key: string | undefined, over: Partial<ImportResult> = {}): ImportResult => ({
	source,
	...(key ? { key } : {}),
	created: true,
	dropped: [],
	...over,
});

function boards(over: Partial<BoardWriter> = {}) {
	const projects = {
		key: "projects",
		providerName: "github",
		list: vi.fn(async () => []),
		find: vi.fn(async () => BOARD as BoardSummary | undefined),
		create: vi.fn(async () => BOARD),
		addItems: vi.fn(async (_o: string, _b: BoardSummary, items: Array<{ key: string }>): Promise<AddedItem[]> =>
			items.map((i) => ({ key: i.key, added: true, dropped: [] }))
		),
		...over,
	} as unknown as BoardWriter;
	return projects;
}

describe("placeOnBoard", () => {
	it("adds each migrated issue with its status, category and priority, on the board it found", async () => {
		const projects = boards();
		const placement = await placeOnBoard({
			projects,
			owner: "acme",
			name: "v5",
			template: TEMPLATE,
			records: [
				record("ENG-1", { status: "In Review", statusCategory: "in-review", priority: "high" }),
				record("ENG-2", { statusCategory: "open" }),
				record("ENG-3", { statusCategory: "done" }),
				record("ENG-4", { statusCategory: "in-progress" }),
				record("ENG-5", { statusCategory: "other" }),
			],
			results: [
				result("ENG-1", "#1"),
				result("ENG-2", "#2"),
				result("ENG-3", "#3"),
				result("ENG-4", "#4"),
				result("ENG-5", "#5"),
				result("ENG-6", "#6"),
				result("ENG-7", undefined),
			],
			dryRun: false,
		});
		expect(projects.create).not.toHaveBeenCalled();
		expect(projects.addItems).toHaveBeenCalledWith(
			"acme",
			BOARD,
			[
				{ key: "#1", status: "In Review", category: "active", priority: "high" },
				{ key: "#2", category: "planned" },
				{ key: "#3", category: "done" },
				{ key: "#4", category: "active" },
				{ key: "#5" },
				{ key: "#6" },
			],
			TEMPLATE
		);
		expect(placement.created).toBe(false);
		expect(placement.items.map((i) => [i.source, i.key, i.added])).toEqual([
			["ENG-1", "#1", true],
			["ENG-2", "#2", true],
			["ENG-3", "#3", true],
			["ENG-4", "#4", true],
			["ENG-5", "#5", true],
			["ENG-6", "#6", true],
		]);
	});

	it("makes the board from the template when it does not exist, and carries what the board dropped", async () => {
		const projects = boards({
			find: vi.fn(async () => undefined),
			addItems: vi.fn(async () => [{ key: "#1", added: false, dropped: ["priority low (no matching option)"] }]),
		});
		const placement = await placeOnBoard({
			projects,
			owner: "acme",
			name: "v5",
			template: TEMPLATE,
			records: [record("ENG-1")],
			results: [result("ENG-1", "#1")],
			dryRun: false,
		});
		expect(projects.create).toHaveBeenCalledWith("acme", "v5", TEMPLATE);
		expect(placement).toMatchObject({ board: BOARD, created: true });
		expect(placement.items).toEqual([
			{ source: "ENG-1", key: "#1", added: false, dropped: ["priority low (no matching option)"] },
		]);
	});

	it("writes nothing on a dry run and only says whether the board exists", async () => {
		const missing = boards({ find: vi.fn(async () => undefined) });
		const input = { owner: "acme", name: "v5", template: TEMPLATE, records: [], results: [], dryRun: true };
		expect(await placeOnBoard({ ...input, projects: missing })).toEqual({
			board: undefined,
			created: true,
			items: [],
		});
		const found = boards();
		expect(await placeOnBoard({ ...input, projects: found })).toEqual({ board: BOARD, created: false, items: [] });
		for (const p of [missing, found]) {
			expect(p.create).not.toHaveBeenCalled();
			expect(p.addItems).not.toHaveBeenCalled();
		}
	});
});
