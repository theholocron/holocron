import { describe, expect, it } from "vitest";

import { serializeBaseline } from "./baseline.js";
import { formatJson } from "./format-json.js";

describe("formatJson", () => {
	it("expands objects, keeps a short array of plain values on one line and ends in one newline", () => {
		expect(formatJson({ a: [1, 2], b: {}, c: [], d: { e: "x" } })).toBe(
			'{\n  "a": [1, 2],\n  "b": {},\n  "c": [],\n  "d": {\n    "e": "x"\n  }\n}\n'
		);
	});

	it("puts an array of plain values that does not fit in 120 columns one value to a line", () => {
		const long = Array.from({ length: 12 }, (_, i) => `a fairly long string number ${i}`);
		const text = formatJson({ list: long });
		expect(text).toContain('"list": [\n    "a fairly long string number 0",\n');
	});

	it("lays an array of objects out one object to a line group", () => {
		expect(formatJson([{ a: 1 }, { b: 2 }])).toBe('[\n  {\n    "a": 1\n  },\n  {\n    "b": 2\n  }\n]\n');
	});

	it("leaves out what JSON leaves out", () => {
		expect(formatJson({ a: undefined, b: 1 })).toBe('{\n  "b": 1\n}\n');
	});
});

describe("serializeBaseline", () => {
	it("lists the pairs in a fixed order", () => {
		const pair = (source: string, workspace: string) => ({
			kind: "collection" as const,
			source,
			workspace,
			sourceHash: "s",
			workspaceHash: "w",
		});
		const a = serializeBaseline([pair("b.json", "x"), pair("a.json", "y"), pair("a.json", "x")]);
		const b = serializeBaseline([pair("a.json", "x"), pair("a.json", "y"), pair("b.json", "x")]);
		expect(a).toBe(b);
		expect(
			JSON.parse(a).pairs.map((p: { source: string; workspace: string }) => `${p.source} ${p.workspace}`)
		).toEqual(["a.json x", "a.json y", "b.json x"]);
	});
});
