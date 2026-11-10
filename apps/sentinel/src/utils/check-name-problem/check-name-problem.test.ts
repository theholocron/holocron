import { describe, expect, it } from "vitest";

import * as actions from "../../actions/index.js";
import { SENTINEL_DISPATCHED_CHECK_NAME } from "../constants/index.js";
import { checkNameProblem } from "./check-name-problem.js";

describe("checkNameProblem", () => {
	it.each([
		"Static Analysis / Run eslint",
		"Compliance / Run Holocron config compatibility (pull_request)",
		"Repo Validation / Validate ADRs and specs",
		"Type Safety / Run tsc --noEmit",
		"Compliance / Run Developer Certificate of Origin",
	])("accepts %s", (name) => {
		expect(checkNameProblem(name)).toBeUndefined();
	});

	it("rejects three tiers", () => {
		expect(checkNameProblem("Source Quality / Static Analysis / Run eslint")).toBe(
			"must have two tiers joined by one ' / ', found 3"
		);
	});

	it("rejects one tier", () => {
		expect(checkNameProblem("Run eslint")).toBe("must have two tiers joined by one ' / ', found 1");
	});

	it("rejects a group that is not Title Case", () => {
		expect(checkNameProblem("static analysis / Run eslint")).toBe(
			'group "static analysis" must be Title Case words'
		);
		expect(checkNameProblem("Static analysis / Run eslint")).toBe(
			'group "Static analysis" must be Title Case words'
		);
		expect(checkNameProblem("STATIC ANALYSIS / Run eslint")).toBe(
			'group "STATIC ANALYSIS" must be Title Case words'
		);
	});

	it("rejects an action that does not start with a capitalised verb", () => {
		expect(checkNameProblem("Static Analysis / run eslint")).toBe(
			'action "run eslint" must start with a capitalised verb'
		);
		expect(checkNameProblem("Static Analysis / eslint")).toBe('action "eslint" must start with a capitalised verb');
		expect(checkNameProblem("Static Analysis / Run")).toBe('action "Run" must start with a capitalised verb');
	});
});

describe("every check Sentinel posts", () => {
	const names = [
		...Object.entries(actions)
			.filter(([key]) => key.endsWith("CHECK_RUN_NAME"))
			.map(([key, value]) => [key, value as string] as const),
		["SENTINEL_DISPATCHED_CHECK_NAME", SENTINEL_DISPATCHED_CHECK_NAME] as const,
	];

	it("finds all thirteen, so a new check cannot skip the rule", () => {
		expect(names).toHaveLength(13);
	});

	it.each(names)("%s has two tiers and the casing rule", (_key, name) => {
		expect(checkNameProblem(name)).toBeUndefined();
	});
});
