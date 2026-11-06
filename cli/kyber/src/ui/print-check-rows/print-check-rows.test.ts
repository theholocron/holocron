import { stripVTControlCharacters } from "node:util";

import { describe, expect, it } from "vitest";

import type { CheckRow } from "../check-row/index.js";
import { printCheckRows } from "./print-check-rows.js";

const row = (over: Partial<CheckRow> = {}): CheckRow => ({
	id: "a",
	title: "a thing",
	status: "ok",
	detail: "fine",
	problems: [],
	...over,
});

const strip = stripVTControlCharacters;

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
