import { describe, expect, it } from "vitest";

import { compareRequiredContexts } from "./required-contexts.js";

describe("compareRequiredContexts", () => {
	it("is empty when the ruleset requires exactly the derived contexts, in any order", () => {
		expect(compareRequiredContexts(["ci / Required checks", "DCO"], ["DCO", "ci / Required checks"])).toEqual([]);
	});

	it("names a derived context the ruleset lacks as missing", () => {
		expect(compareRequiredContexts(["ci / Required checks", "DCO"], ["DCO"])).toEqual([
			"missing required check ci / Required checks",
		]);
	});

	it("names a required context the derived list does not want as stale", () => {
		expect(
			compareRequiredContexts(["ci / Required checks", "DCO"], ["DCO", "Typecheck / Run tsc --noEmit"])
		).toEqual([
			"missing required check ci / Required checks",
			"stale context Typecheck / Run tsc --noEmit (not in the derived required checks)",
		]);
	});
});
