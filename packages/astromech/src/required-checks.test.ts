import { describe, expect, it } from "vitest";

import { requiredChecks } from "./required-checks.js";

describe("requiredChecks", () => {
	it("returns [] with no config", () => {
		expect(requiredChecks({})).toEqual([]);
	});

	it("returns [] when tasks exist but none are required", () => {
		expect(
			requiredChecks({
				tasks: ["sourceQuality.staticAnalysis", "verification.unitTests", { name: "verification.typeSafety" }],
			})
		).toEqual([]);
	});

	it("maps each required task to its check context", () => {
		expect(
			requiredChecks({
				tasks: [
					{ name: "sourceQuality.staticAnalysis", required: true },
					{ name: "verification.unitTests", required: true },
					{ name: "verification.typeSafety", required: true },
				],
			})
		).toEqual(["Typecheck / tsc --noEmit", "Static Analysis / Static Analysis", "Test / Conclusion"]);
	});

	it("orders task contexts by CI_ORDER regardless of manifest order", () => {
		expect(
			requiredChecks({
				tasks: [
					{ name: "verification.unitTests", required: true },
					{ name: "verification.typeSafety", required: true },
					{ name: "sourceQuality.staticAnalysis", required: true },
					{ name: "delivery.bundleSize", required: true },
				],
			})
		).toEqual([
			"Typecheck / tsc --noEmit",
			"Static Analysis / Static Analysis",
			"Test / Conclusion",
			"Audit the bundle size / Audit the bundle size",
		]);
	});

	it("appends extraRequiredChecks after the task contexts, in declared order", () => {
		expect(
			requiredChecks({
				tasks: [{ name: "sourceQuality.staticAnalysis", required: true }],
				extraRequiredChecks: ["codecov/patch", "codecov/project", "tsdown (every workspace)"],
			})
		).toEqual([
			"Static Analysis / Static Analysis",
			"codecov/patch",
			"codecov/project",
			"tsdown (every workspace)",
		]);
	});

	it("de-duplicates a context that appears as both a task context and an extra", () => {
		expect(
			requiredChecks({
				tasks: [{ name: "sourceQuality.staticAnalysis", required: true }],
				extraRequiredChecks: ["Static Analysis / Static Analysis", "codecov/patch"],
			})
		).toEqual(["Static Analysis / Static Analysis", "codecov/patch"]);
	});

	it("ignores a required task with no known check context", () => {
		expect(requiredChecks({ tasks: [{ name: "delivery.deploy", required: true }] })).toEqual([]);
	});

	it("accepts a bare string task (never required)", () => {
		expect(requiredChecks({ tasks: ["sourceQuality.staticAnalysis"], extraRequiredChecks: ["X"] })).toEqual(["X"]);
	});
});
