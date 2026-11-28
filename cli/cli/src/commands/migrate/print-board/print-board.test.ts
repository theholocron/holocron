import { stripVTControlCharacters } from "node:util";

import { describe, expect, it } from "vitest";

import { printBoard } from "./print-board.js";

const board = { id: "B", name: "v5", url: "https://x/5", closed: false };

function lines(over: Parameters<typeof printBoard>[0] extends infer I ? Partial<I> : never) {
	const out: string[] = [];
	printBoard({
		print: (l) => out.push(stripVTControlCharacters(l)),
		name: "v5",
		template: "roadmap",
		placement: { board, created: false, items: [] },
		dryRun: false,
		...over,
	});
	return out.join("\n");
}

describe("printBoard", () => {
	it("says how many issues were added and how many were already there, with the board's address", () => {
		const text = lines({
			placement: {
				board,
				created: true,
				items: [
					{ source: "a", key: "#1", added: true, dropped: [] },
					{ source: "b", key: "#2", added: false, dropped: [] },
				],
			},
		});
		expect(text).toContain('board "v5": created, added 1, already there 1 (https://x/5)');
		expect(lines({})).toContain('board "v5": found, added 0, already there 0');
	});

	it("on a dry run says whether the board would be made", () => {
		expect(lines({ dryRun: true, placement: { created: true, items: [] } })).toContain(
			'board "v5": would create from template roadmap'
		);
		expect(lines({ dryRun: true })).toContain('board "v5": exists; would add the issues to it');
	});
});
