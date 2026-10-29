import { describe, expect, it } from "vitest";

import { detectIndent, stringifyJson } from "./stringify-json.ts";

const sample = { name: "x", nested: { a: [1, 2], b: "line\nbreak" }, empty: {} };

describe("stringifyJson", () => {
	it("defaults to JSON.stringify(v, null, 2) plus one trailing newline", () => {
		expect(stringifyJson(sample)).toBe(JSON.stringify(sample, null, 2) + "\n");
	});

	it("takes a numeric indent", () => {
		expect(stringifyJson({ a: 1 }, { indent: 4 })).toBe('{\n    "a": 1\n}\n');
	});

	it("takes a string indent", () => {
		expect(stringifyJson({ a: 1 }, { indent: "\t" })).toBe('{\n\t"a": 1\n}\n');
	});

	it("ends in exactly one newline, including for scalars and empty containers", () => {
		expect(stringifyJson({})).toBe("{}\n");
		expect(stringifyJson([])).toBe("[]\n");
		expect(stringifyJson("s")).toBe('"s"\n');
		expect(stringifyJson(null)).toBe("null\n");
	});

	it("throws for a value with no JSON representation", () => {
		expect(() => stringifyJson(undefined)).toThrow(TypeError);
		expect(() => stringifyJson(() => 1)).toThrow(/no JSON representation/);
	});

	it("rejects an indent that would make the output invalid JSON", () => {
		expect(() => stringifyJson({ a: 1 }, { indent: "x" })).toThrow(/spaces and tabs/);
		expect(() => stringifyJson({ a: 1 }, { indent: "  //" })).toThrow(TypeError);
		expect(() => stringifyJson({ a: 1 }, { indent: -1 })).toThrow(/non-negative integer/);
		expect(() => stringifyJson({ a: 1 }, { indent: 1.5 })).toThrow(TypeError);
	});

	it("an indent of 0 or empty string is minified", () => {
		expect(stringifyJson({ a: [1] }, { indent: 0 })).toBe('{"a":[1]}\n');
		expect(stringifyJson({ a: 1 }, { indent: "" })).toBe('{"a":1}\n');
	});

	it("keeps an indent longer than JSON.stringify's ten-character cap", () => {
		expect(stringifyJson({ a: { b: 1 } }, { indent: 12 })).toBe(
			`{\n${" ".repeat(12)}"a": {\n${" ".repeat(24)}"b": 1\n${" ".repeat(12)}}\n}\n`
		);
		const wide = "\t".repeat(11);
		expect(stringifyJson({ a: 1 }, { indent: wide })).toBe(`{\n${wide}"a": 1\n}\n`);
	});

	it("doesn't touch tabs inside string values when re-indenting", () => {
		expect(stringifyJson({ a: "x\ty" }, { indent: 4 })).toBe('{\n    "a": "x\\ty"\n}\n');
	});

	describe("like", () => {
		it("keeps an over-ten-character detected indent", () => {
			const wide = " ".repeat(12);
			const original = `{\n${wide}"a": 1\n}\n`;
			expect(stringifyJson({ a: 1 }, { like: original })).toBe(original);
		});

		it("uses the majority line ending of a mixed-EOL file", () => {
			expect(stringifyJson({ a: 1 }, { like: '{\r\n  "a": 1,\r\n  "b": 2\n}\r\n' })).toBe(
				'{\r\n  "a": 1\r\n}\r\n'
			);
			expect(stringifyJson({ a: 1 }, { like: '{\n  "a": 1,\n  "b": 2\r\n}\n' })).toBe('{\n  "a": 1\n}\n');
			expect(stringifyJson({ a: 1 }, { like: '{\r\n  "a": 1\n}' })).toBe('{\n  "a": 1\n}\n');
		});

		it("ignores padding before the root value when detecting the indent", () => {
			expect(stringifyJson({ a: 1 }, { like: '  {\n    "a": 1\n  }' })).toBe('{\n  "a": 1\n}\n');
			expect(stringifyJson({ a: 1 }, { like: '\t{"a":1}', indent: 4 })).toBe('{\n    "a": 1\n}\n');
		});

		it("keeps a tab-indented file's tabs", () => {
			const original = '{\n\t"a": 1\n}\n';
			expect(stringifyJson({ a: 1, b: 2 }, { like: original })).toBe('{\n\t"a": 1,\n\t"b": 2\n}\n');
		});

		it("keeps a 4-space file's indent", () => {
			expect(stringifyJson({ a: { b: 1 } }, { like: '{\n    "a": 1\n}\n' })).toBe(
				'{\n    "a": {\n        "b": 1\n    }\n}\n'
			);
		});

		it("keeps CRLF line endings, without touching newlines escaped inside strings", () => {
			const out = stringifyJson({ a: "x\ny" }, { like: '{\r\n  "a": 1\r\n}\r\n' });
			expect(out).toBe('{\r\n  "a": "x\\ny"\r\n}\r\n');
			expect(out.replace(/\r\n/g, "")).not.toContain("\n");
		});

		it("falls back to indent for minified or empty input", () => {
			expect(stringifyJson({ a: 1 }, { like: '{"a":1}' })).toBe('{\n  "a": 1\n}\n');
			expect(stringifyJson({ a: 1 }, { like: "" })).toBe('{\n  "a": 1\n}\n');
			expect(stringifyJson({ a: 1 }, { like: '{"a":1}', indent: 4 })).toBe('{\n    "a": 1\n}\n');
		});

		it("wins over indent when detection succeeds", () => {
			expect(stringifyJson({ a: 1 }, { like: '{\n\t"a": 1\n}', indent: 8 })).toBe('{\n\t"a": 1\n}\n');
		});

		it("is idempotent: re-stringifying parsed text with like reproduces it", () => {
			for (const original of [
				'{\n  "a": [\n    1,\n    2\n  ]\n}\n',
				'{\n\t"a": {\n\t\t"b": true\n\t}\n}\n',
				'{\r\n    "a": 1\r\n}\r\n',
			]) {
				expect(stringifyJson(JSON.parse(original), { like: original })).toBe(original);
			}
		});
	});
});

describe("detectIndent", () => {
	it("returns the leading whitespace of the first indented line", () => {
		expect(detectIndent('{\n  "a": 1\n}')).toBe("  ");
		expect(detectIndent('{\n\t"a": 1\n}')).toBe("\t");
		expect(detectIndent('{\r\n    "a": 1\r\n}')).toBe("    ");
	});

	it("uses the first indented line, not the deepest", () => {
		expect(detectIndent('{\n  "a": {\n      "b": 1\n  }\n}')).toBe("  ");
	});

	it("is undefined when nothing is indented", () => {
		expect(detectIndent("")).toBeUndefined();
		expect(detectIndent('{"a":1}')).toBeUndefined();
		expect(detectIndent("{\n}")).toBeUndefined();
	});

	it("excludes whitespace before the root value", () => {
		expect(detectIndent('  {\n    "a": 1\n  }')).toBe("  ");
		expect(detectIndent('  {"a":1}')).toBeUndefined();
		expect(detectIndent("\n\n  \n")).toBeUndefined();
		expect(detectIndent('\t{\n  "a": 1\n}')).toBe("  ");
	});

	it("ignores whitespace-only lines", () => {
		expect(detectIndent('{\n   \n  "a": 1\n}')).toBe("  ");
	});
});
