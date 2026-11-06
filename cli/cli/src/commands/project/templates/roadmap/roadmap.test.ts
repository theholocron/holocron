import { describe, expect, it } from "vitest";

import { ROADMAP_TEMPLATE } from "./roadmap.js";

describe("ROADMAP_TEMPLATE", () => {
	it("has the five statuses in board order, each with the category that says what it means", () => {
		expect(ROADMAP_TEMPLATE.statuses.map((s) => [s.name, s.category])).toEqual([
			["Someday", "backlog"],
			["Todo", "planned"],
			["In Progress", "active"],
			["Blocked", "blocked"],
			["Done", "done"],
		]);
	});

	it("has a priority and a milestone field", () => {
		expect(ROADMAP_TEMPLATE.fields.map((f) => f.name)).toEqual(["Priority"]);
		expect(ROADMAP_TEMPLATE.fields[0]?.options).toEqual(["1 · Now", "2 · Next", "3 · Process"]);
	});

	it("opens on the Active view, and only that one is the default", () => {
		expect(ROADMAP_TEMPLATE.views.filter((v) => v.default).map((v) => v.name)).toEqual(["Active"]);
	});

	it("keeps the auto-add rule on", () => {
		expect(ROADMAP_TEMPLATE.rules).toEqual(["Auto-add sub-issues to project"]);
	});
});
