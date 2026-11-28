import { describe, expect, it } from "vitest";

import { declaredRequiredChecks } from "./declared-required-checks.js";

describe("declaredRequiredChecks", () => {
	it("is undefined when the repo leaves the list out, so the tasks derive it", () => {
		expect(declaredRequiredChecks(undefined)).toBeUndefined();
		expect(declaredRequiredChecks({})).toBeUndefined();
	});

	it("is the list as written, in order and with a repeat dropped", () => {
		expect(declaredRequiredChecks({ requiredChecks: ["b / x", "a / y", "b / x"] })).toEqual(["b / x", "a / y"]);
	});
});
