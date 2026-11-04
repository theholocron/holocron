import { describe, expect, it } from "vitest";

import { readAutoFix } from "./read-auto-fix.js";

describe("readAutoFix", () => {
	it("reads the flat id `format`", () => {
		expect(readAutoFix([{ name: "format", with: { autoFix: false } }])).toBe(false);
		expect(readAutoFix([{ name: "format", with: { autoFix: true } }])).toBe(true);
	});

	it("reads the deprecated alias, which resolves to several successors including `format`", () => {
		expect(readAutoFix([{ name: "sourceQuality.formatting", with: { autoFix: false } }])).toBe(false);
	});

	it("lets the flat id win when both are present, whatever the order", () => {
		const flat = { name: "format", with: { autoFix: false } };
		const alias = { name: "sourceQuality.formatting", with: { autoFix: true } };
		expect(readAutoFix([alias, flat])).toBe(false);
		expect(readAutoFix([flat, alias])).toBe(false);
	});

	it("falls back to the alias when the flat entry declares no boolean", () => {
		expect(readAutoFix([{ name: "format" }, { name: "sourceQuality.formatting", with: { autoFix: false } }])).toBe(
			false
		);
	});

	it("is undefined when neither is present or the entries carry no autoFix", () => {
		expect(readAutoFix([])).toBeUndefined();
		expect(readAutoFix([{ name: "typecheck", with: { autoFix: false } }])).toBeUndefined();
		expect(readAutoFix([{ name: "format" }, { name: "sourceQuality.formatting", with: {} }])).toBeUndefined();
	});

	it("ignores a task whose alias does not include `format`", () => {
		expect(readAutoFix([{ name: "sourceQuality.staticAnalysis", with: { autoFix: false } }])).toBeUndefined();
	});

	it("ignores a value that is not a boolean", () => {
		expect(readAutoFix([{ name: "format", with: { autoFix: "false" } }])).toBeUndefined();
		expect(readAutoFix([{ name: "format", with: { autoFix: 0 } }])).toBeUndefined();
	});
});
