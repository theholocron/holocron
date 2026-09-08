import { describe, expect, it } from "vitest";

import { normalizeTaskEntry } from "./schema.js";

describe("normalizeTaskEntry", () => {
	it("expands a bare string to a defaulted entry", () => {
		expect(normalizeTaskEntry("lint")).toEqual({ name: "lint", ci: true, local: true });
	});

	it("applies ci/local defaults without clobbering explicit values", () => {
		expect(normalizeTaskEntry({ name: "audit", ci: true, local: false })).toEqual({
			name: "audit",
			ci: true,
			local: false,
		});
	});

	it("keeps extra fields (required, with, linters)", () => {
		const entry = normalizeTaskEntry({ name: "lint", linters: ["eslint"], required: true });
		expect(entry.linters).toEqual(["eslint"]);
		expect(entry.required).toBe(true);
		expect(entry.ci).toBe(true);
	});
});
