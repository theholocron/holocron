import { describe, expect, it } from "vitest";

import { lineHunks } from "./line-hunks.js";

const lines = (text: string) => text.split("");

describe("lineHunks", () => {
	it("finds nothing for equal texts", () => {
		expect(lineHunks(lines("abc"), lines("abc"))).toEqual([]);
		expect(lineHunks([], [])).toEqual([]);
	});

	it("finds one replacement", () => {
		expect(lineHunks(lines("abc"), lines("aXc"))).toEqual([{ from: 1, to: 2, fixedFrom: 1, fixedTo: 2 }]);
	});

	it("finds a pure insertion and a pure deletion", () => {
		expect(lineHunks(lines("ac"), lines("abc"))).toEqual([{ from: 1, to: 1, fixedFrom: 1, fixedTo: 2 }]);
		expect(lineHunks(lines("abc"), lines("ac"))).toEqual([{ from: 1, to: 2, fixedFrom: 1, fixedTo: 1 }]);
	});

	it("finds separate edits as separate hunks, with what lies between them untouched", () => {
		expect(lineHunks(lines("aXbcdYe"), lines("abcde"))).toEqual([
			{ from: 1, to: 2, fixedFrom: 1, fixedTo: 1 },
			{ from: 5, to: 6, fixedFrom: 4, fixedTo: 4 },
		]);
	});

	it("keeps a contiguous run of changed lines as one hunk", () => {
		expect(lineHunks(lines("aBCDe"), lines("aXYZe"))).toEqual([{ from: 1, to: 4, fixedFrom: 1, fixedTo: 4 }]);
	});

	it("handles an empty side", () => {
		expect(lineHunks([], lines("ab"))).toEqual([{ from: 0, to: 0, fixedFrom: 0, fixedTo: 2 }]);
		expect(lineHunks(lines("ab"), [])).toEqual([{ from: 0, to: 2, fixedFrom: 0, fixedTo: 0 }]);
	});

	it("takes a middle too large to tabulate as one hunk", () => {
		const original = Array.from({ length: 2500 }, (_, i) => `a${i}`);
		const fixed = Array.from({ length: 2500 }, (_, i) => `b${i}`);
		expect(lineHunks(original, fixed)).toEqual([{ from: 0, to: 2500, fixedFrom: 0, fixedTo: 2500 }]);
	});

	it("applying every hunk to the original gives the fixed text, whatever the edits", () => {
		let seed = 12345;
		const random = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
		for (let round = 0; round < 200; round++) {
			const original = Array.from({ length: Math.floor(random() * 12) }, () => String(Math.floor(random() * 4)));
			const fixed = Array.from({ length: Math.floor(random() * 12) }, () => String(Math.floor(random() * 4)));
			let rebuilt: string[] = [];
			let cursor = 0;
			for (const h of lineHunks(original, fixed)) {
				rebuilt = [...rebuilt, ...original.slice(cursor, h.from), ...fixed.slice(h.fixedFrom, h.fixedTo)];
				cursor = h.to;
			}
			rebuilt = [...rebuilt, ...original.slice(cursor)];
			expect(rebuilt).toEqual(fixed);
		}
	});
});
