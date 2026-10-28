import { describe, expect, it } from "vitest";

import { resolveExportEntry } from "./resolve-export-entry.js";

describe("resolveExportEntry", () => {
	it("returns a bare string entry as is", () => {
		expect(resolveExportEntry("./dist/index.mjs")).toBe("./dist/index.mjs");
	});

	it("prefers import, then default, then require", () => {
		expect(resolveExportEntry({ require: "./c.cjs", default: "./b.js", import: "./a.mjs" })).toBe("./a.mjs");
		expect(resolveExportEntry({ require: "./c.cjs", default: "./b.js" })).toBe("./b.js");
		expect(resolveExportEntry({ require: "./c.cjs" })).toBe("./c.cjs");
	});

	it("unwraps a nested condition object (import: { types, default })", () => {
		expect(resolveExportEntry({ import: { types: "./t.d.mts", default: "./a.mjs" } })).toBe("./a.mjs");
	});

	it("returns undefined for anything else", () => {
		expect(resolveExportEntry(undefined)).toBeUndefined();
		expect(resolveExportEntry(null)).toBeUndefined();
		expect(resolveExportEntry(42)).toBeUndefined();
		expect(resolveExportEntry({})).toBeUndefined();
		expect(resolveExportEntry({ import: 7 })).toBeUndefined();
	});
});
