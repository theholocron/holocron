import { stripVTControlCharacters } from "node:util";

import { describe, expect, it } from "vitest";

import { type CheckRow, declaredVsActual, printCheckRows, printCheckSummary, summariseChecks } from "./index.js";

const row = (over: Partial<CheckRow> = {}): CheckRow => ({
	id: "a",
	title: "a thing",
	status: "ok",
	detail: "fine",
	problems: [],
	...over,
});

const strip = stripVTControlCharacters;

describe("summariseChecks", () => {
	it("counts each way a row can end", () => {
		const rows = [row(), row(), row({ status: "fail" }), row({ status: "skip" })];
		expect(summariseChecks(rows)).toEqual({ ok: 2, fail: 1, skip: 1 });
	});

	it("is all zeros for no rows", () => {
		expect(summariseChecks([])).toEqual({ ok: 0, fail: 0, skip: 0 });
	});
});

describe("printCheckRows", () => {
	it("prints a row per step with titles padded to the widest and each problem beneath", () => {
		const lines: string[] = [];
		printCheckRows(
			[
				row({ title: "short" }),
				row({ title: "a longer title", status: "fail", detail: "2 problem(s)", problems: ["one", "two"] }),
			],
			(l) => lines.push(strip(l))
		);
		expect(lines).toEqual([
			"  ✓ short           fine",
			"  ✗ a longer title  2 problem(s)",
			"      - one",
			"      - two",
		]);
	});

	it("prints nothing for no rows", () => {
		const lines: string[] = [];
		printCheckRows([], (l) => lines.push(l));
		expect(lines).toEqual([]);
	});

	it("marks a skipped row", () => {
		const lines: string[] = [];
		printCheckRows([row({ status: "skip", detail: "no token" })], (l) => lines.push(strip(l)));
		expect(lines[0]).toContain("no token");
		expect(lines[0]).toContain("·");
	});
});

describe("printCheckSummary", () => {
	it("prints a blank line, then the counts", () => {
		const lines: string[] = [];
		printCheckSummary({ ok: 3, fail: 1, skip: 2 }, (l) => lines.push(strip(l)));
		expect(lines).toEqual(["", "3 ok, 1 fail, 2 skipped"]);
	});
});

describe("declaredVsActual", () => {
	const map = (o: Record<string, string>) => new Map(Object.entries(o));

	it("is empty when they match", () => {
		expect(declaredVsActual(map({ A: "1" }), map({ A: "1" }), { noun: "variable" })).toEqual([]);
	});

	it("names a declared key that is missing, a key that is not declared, and a value that differs", () => {
		const problems = declaredVsActual(map({ A: "1", B: "2", C: "3" }), map({ A: "1", C: "9", D: "4" }), {
			noun: "variable",
		});
		expect(problems).toEqual(["missing variable B", "variable C: declared 3, found 9", "unexpected variable D"]);
	});

	it("leaves out the keys that are not declared when asked to", () => {
		expect(
			declaredVsActual(map({ A: "1" }), map({ A: "1", D: "4" }), { noun: "secret", flagExtra: false })
		).toEqual([]);
	});

	it("compares and shows values the way it is told to", () => {
		const problems = declaredVsActual(new Map([["a", { n: 1 }]]), new Map([["a", { n: 2 }]]), {
			noun: "check",
			equal: (x, y) => x.n === y.n,
			show: (v) => `n=${v.n}`,
		});
		expect(problems).toEqual(["check a: declared n=1, found n=2"]);
	});
});
