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

	it("keeps extra fields (required, with, paths)", () => {
		const entry = normalizeTaskEntry({ name: "delivery.deploy", with: { docs: true }, required: true });
		expect(entry.with).toEqual({ docs: true });
		expect(entry.required).toBe(true);
		expect(entry.ci).toBe(true);
	});
});
