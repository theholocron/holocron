import { stripVTControlCharacters } from "node:util";

import { describe, expect, it } from "vitest";

import { printCheckSummary } from "./print-check-summary.js";

const strip = stripVTControlCharacters;

describe("printCheckSummary", () => {
	it("prints a blank line, then the counts", () => {
		const lines: string[] = [];
		printCheckSummary({ ok: 3, fail: 1, skip: 2 }, (l) => lines.push(strip(l)));
		expect(lines).toEqual(["", "3 ok, 1 fail, 2 skipped"]);
	});
});
