import { describe, expect, it } from "vitest";

import { statusContexts } from "./status-contexts.js";

describe("statusContexts", () => {
	it("lists the two required aggregate statuses and an informational one per component, sorted", () => {
		expect(statusContexts({ components: ["zeta", "alpha"], documentation: "off" })).toEqual([
			{ name: "codecov/patch", required: true },
			{ name: "codecov/patch/alpha", required: false },
			{ name: "codecov/patch/zeta", required: false },
			{ name: "codecov/project", required: true },
		]);
	});

	it("lists only the aggregate statuses for no components", () => {
		expect(statusContexts({ components: [], documentation: "off" }).map((c) => c.name)).toEqual([
			"codecov/patch",
			"codecov/project",
		]);
	});

	it("adds the documentation statuses in warn mode, none of them required", () => {
		expect(statusContexts({ components: [], documentation: "warn" })).toEqual([
			{ name: "codecov/patch", required: true },
			{ name: "codecov/patch/documentation", required: false },
			{ name: "codecov/project", required: true },
			{ name: "codecov/project/documentation", required: false },
		]);
	});

	it("requires only the documentation patch status in required mode", () => {
		const required = statusContexts({ components: ["a"], documentation: "required" })
			.filter((context) => context.required)
			.map((context) => context.name);
		expect(required).toEqual(["codecov/patch", "codecov/patch/documentation", "codecov/project"]);
	});

	it("lists a name once when a component repeats or collides with the documentation flag", () => {
		const names = statusContexts({ components: ["a", "a", "documentation"], documentation: "required" }).map(
			(context) => context.name
		);
		expect(names).toEqual([
			"codecov/patch",
			"codecov/patch/a",
			"codecov/patch/documentation",
			"codecov/project",
			"codecov/project/documentation",
		]);
		expect(
			statusContexts({ components: ["documentation"], documentation: "required" }).find(
				(context) => context.name === "codecov/patch/documentation"
			)
		).toEqual({ name: "codecov/patch/documentation", required: true });
	});
});
