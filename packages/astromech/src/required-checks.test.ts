import { describe, expect, it } from "vitest";

import { requiredChecks } from "./required-checks.js";

describe("requiredChecks", () => {
	it("returns [] with no config", () => {
		expect(requiredChecks({})).toEqual([]);
	});

	it("returns [] when tasks exist but none are required", () => {
		expect(requiredChecks({ tasks: ["lint", "test", { name: "typecheck" }] })).toEqual([]);
	});

	it("maps each required task to its Conclusion check context", () => {
		expect(
			requiredChecks({
				tasks: [
					{ name: "lint", required: true },
					{ name: "test", required: true },
					{ name: "typecheck", required: true },
				],
			})
		).toEqual(["Typecheck / Conclusion", "Lint / Conclusion", "Test / Conclusion"]);
	});

	it("orders task contexts by CI_ORDER regardless of manifest order", () => {
		expect(
			requiredChecks({
				tasks: [
					{ name: "test", required: true },
					{ name: "typecheck", required: true },
					{ name: "lint", required: true },
					{ name: "audit", required: true },
				],
			})
		).toEqual(["Typecheck / Conclusion", "Lint / Conclusion", "Test / Conclusion", "audit / Conclusion"]);
	});

	it("appends extraRequiredChecks after the task contexts, in declared order", () => {
		expect(
			requiredChecks({
				tasks: [{ name: "lint", required: true }],
				extraRequiredChecks: ["codecov/patch", "codecov/project", "tsdown (every workspace)"],
			})
		).toEqual(["Lint / Conclusion", "codecov/patch", "codecov/project", "tsdown (every workspace)"]);
	});

	it("de-duplicates a context that appears as both a task context and an extra", () => {
		expect(
			requiredChecks({
				tasks: [{ name: "lint", required: true }],
				extraRequiredChecks: ["Lint / Conclusion", "codecov/patch"],
			})
		).toEqual(["Lint / Conclusion", "codecov/patch"]);
	});

	it("ignores a required task with no known check context", () => {
		expect(requiredChecks({ tasks: [{ name: "deploy", required: true }] })).toEqual([]);
	});

	it("accepts a bare string task (never required)", () => {
		expect(requiredChecks({ tasks: ["lint"], extraRequiredChecks: ["X"] })).toEqual(["X"]);
	});
});
