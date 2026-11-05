import { describe, expect, it } from "vitest";

import { SPRINT_TEMPLATE } from "./sprint.js";

describe("SPRINT_TEMPLATE", () => {
	it("has a status for each category a sprint uses, and a sprint field", () => {
		expect(SPRINT_TEMPLATE.statuses.map((s) => s.category)).toEqual(["planned", "active", "blocked", "done"]);
		expect(SPRINT_TEMPLATE.fields).toEqual([{ name: "Sprint", type: "text" }]);
	});

	it("opens on the Active view", () => {
		expect(SPRINT_TEMPLATE.views.find((v) => v.default)?.name).toBe("Active");
	});
});
