import { format } from "prettier";
import { describe, expect, it } from "vitest";

import { formatJson } from "./format-json.js";

/** What this repo's `prettier --check` wants for a `.json` file (see configs/prettier-config), fed the expanded form. */
const prettier = (value: unknown): Promise<string> =>
	format(JSON.stringify(value, null, 2), { parser: "json", printWidth: 120, tabWidth: 2, useTabs: false });

describe("formatJson", () => {
	it("is what Prettier makes of the same value", async () => {
		const values: unknown[] = [
			{ allow: ["dead", "execute", "hook"], nested: { deep: { list: ["a"] } } },
			{ empty: [], none: {}, flag: true, nothing: null, n: 3, s: "text" },
			{ list: [{ a: 1 }, { b: [1, 2, 3] }] },
			["one", "two"],
			"just a string",
			42,
			{ "key with spaces": "value", $schema: "https://example.com/schema.json" },
		];
		for (const value of values) {
			expect(formatJson(value)).toBe(await prettier(value));
		}
	});

	it("keeps an array of values on one line when it fits, and one per line when it does not", async () => {
		const short = { files: ["a.ts", "b.ts"] };
		expect(formatJson(short)).toBe('{\n  "files": ["a.ts", "b.ts"]\n}\n');
		const long = { files: Array.from({ length: 12 }, (_, i) => `a-fairly-long-file-name-${i}.ts`) };
		const text = formatJson(long);
		expect(text.split("\n").length).toBeGreaterThan(12);
		expect(text).toBe(await prettier(long));
	});

	it("counts the key before the array and the comma after it when it decides whether the array fits", async () => {
		// "  \"k\": [" is 8 columns before the items; sweep the item width across the 120-column edge, with and
		// without a following key (a following key puts a comma after the array)
		for (let width = 100; width <= 112; width++) {
			const list = ["x".repeat(width)];
			for (const value of [{ k: list }, { k: list, after: 1 }]) {
				expect(formatJson(value)).toBe(await prettier(value));
			}
		}
	});

	it("indents nested arrays and objects by two spaces", () => {
		expect(formatJson({ a: { b: [{ c: 1 }] } })).toBe(
			'{\n  "a": {\n    "b": [\n      {\n        "c": 1\n      }\n    ]\n  }\n}\n'
		);
	});

	it("drops what JSON leaves out, and ends in a single newline", () => {
		const text = formatJson({ keep: 1, drop: undefined });
		expect(text).toBe('{\n  "keep": 1\n}\n');
	});

	it("refuses a value with no JSON representation", () => {
		expect(() => formatJson(undefined)).toThrow(/no JSON representation/);
	});
});
