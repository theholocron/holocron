import { describe, expect, it } from "vitest";

import type { PackageDocs } from "./docs-coverage.type.js";
import { toLcov } from "./to-lcov.js";

const sym = (file: string, line: number, documented: boolean) => ({
	kind: "Function",
	name: "x",
	file,
	line,
	documented,
});

describe("toLcov", () => {
	it("writes one DA line per symbol, hit when documented, grouped by file", () => {
		const packages: PackageDocs[] = [
			{
				name: "@s/a",
				dir: "a",
				symbols: [sym("a/src/b.ts", 7, false), sym("a/src/a.ts", 2, true), sym("a/src/a.ts", 5, false)],
			},
		];
		expect(toLcov(packages)).toBe(
			[
				"TN:",
				"SF:a/src/a.ts",
				"DA:2,1",
				"DA:5,0",
				"LF:2",
				"LH:1",
				"end_of_record",
				"SF:a/src/b.ts",
				"DA:7,0",
				"LF:1",
				"LH:0",
				"end_of_record",
				"",
			].join("\n")
		);
	});

	it("counts a line with two symbols as documented only when both are", () => {
		const out = toLcov([
			{
				name: "@s/a",
				dir: "a",
				symbols: [sym("a.ts", 1, true), sym("a.ts", 1, false), sym("b.ts", 1, true), sym("b.ts", 1, true)],
			},
		]);
		expect(out).toContain("SF:a.ts\nDA:1,0");
		expect(out).toContain("SF:b.ts\nDA:1,1");
	});

	it("is just the header for no symbols", () => {
		expect(toLcov([])).toBe("TN:\n");
	});
});
