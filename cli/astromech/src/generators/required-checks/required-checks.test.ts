import { describe, expect, it } from "vitest";

import { AGGREGATE_CHECK, requiredChecks } from "./required-checks.js";

describe("requiredChecks", () => {
	it("names the aggregate check `ci`", () => {
		expect(AGGREGATE_CHECK).toBe("ci");
	});

	it("is `ci` and `DCO` with the aggregate, whatever the manifest holds", () => {
		expect(requiredChecks({}, true)).toEqual(["ci", "DCO"]);
		expect(
			requiredChecks(
				{
					tasks: [{ name: "verification.typeSafety", required: true }],
					extraRequiredChecks: ["codecov/patch", "Generated files / Check"],
				},
				true
			)
		).toEqual(["ci", "DCO"]);
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
		).toEqual(["DCO", "Typecheck / Run tsc --noEmit", "codecov/patch"]);
	});

	it("lists `DCO` once when an extra repeats it", () => {
		expect(requiredChecks({ extraRequiredChecks: ["DCO", "X"] }, false)).toEqual(["DCO", "X"]);
	});
});
