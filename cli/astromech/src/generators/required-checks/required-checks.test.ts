import { describe, expect, it } from "vitest";

import { AGGREGATE_CHECK, DCO_CHECK, requiredChecks } from "./required-checks.js";

describe("requiredChecks", () => {
	it("names the aggregate check by its caller and called job", () => {
		expect(AGGREGATE_CHECK).toBe("ci / Required checks");
	});

	it("names Sentinel's DCO check, which replaced the DCO app's `DCO` (#1044)", () => {
		expect(DCO_CHECK).toBe("validate:dco / Run Developer Certificate of Origin");
	});

	it("is `ci / Required checks` and the DCO check with the aggregate, whatever the manifest holds", () => {
		expect(requiredChecks({}, true)).toEqual(["ci / Required checks", DCO_CHECK]);
		expect(
			requiredChecks(
				{
					tasks: [{ name: "verification.typeSafety", required: true }],
					extraRequiredChecks: ["codecov/patch", "Generated files / Check"],
				},
				true
			)
		).toEqual(["ci / Required checks", DCO_CHECK]);
	});

	it("is `DCO` then the per-task contexts then the extras without the aggregate", () => {
		expect(
			requiredChecks(
				{
					tasks: [{ name: "verification.typeSafety", required: true }],
					extraRequiredChecks: ["codecov/patch"],
				},
				false
			)
		).toEqual([DCO_CHECK, "typecheck / Run tsc --noEmit", "codecov/patch"]);
	});

	it("adds the required statuses a coverage provider reports, after the extras, and not the others", () => {
		const statusContexts = [
			{ name: "cov/patch", required: true },
			{ name: "cov/patch/a", required: false },
		];
		expect(requiredChecks({ extraRequiredChecks: ["X", "cov/patch"] }, false, statusContexts)).toEqual([
			DCO_CHECK,
			"X",
			"cov/patch",
		]);
		expect(requiredChecks({}, false, statusContexts)).toEqual([DCO_CHECK, "cov/patch"]);
		expect(requiredChecks({}, true, statusContexts)).toEqual(["ci / Required checks", DCO_CHECK]);
	});

	it("lists `DCO` once when an extra repeats it", () => {
		expect(requiredChecks({ extraRequiredChecks: [DCO_CHECK, "X"] }, false)).toEqual([DCO_CHECK, "X"]);
	});
});
