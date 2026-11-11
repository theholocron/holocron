import { describe, expect, it } from "vitest";

import * as actions from "../../actions/index.js";
import { SENTINEL_DISPATCHED_CHECK_NAME } from "../constants/index.js";
import { SENTINEL_CHECK_PREFIX } from "../sentinel-check-name/index.js";
import { CHECK_ACTION_VERBS, checkNameProblem } from "./check-name-problem.js";

describe("checkNameProblem", () => {
	it.each([
		"sentinel:lint:code / Run eslint",
		"sentinel:validate:config / Run Holocron config compatibility (pull_request)",
		"sentinel:validate:specs / Validate ADRs and specs",
		"sentinel:typecheck / Run tsc --noEmit",
		"sentinel:validate:dco / Run Developer Certificate of Origin",
		"sentinel:deploy-preview / Run vercel",
	])("accepts %s", (name) => {
		expect(checkNameProblem(name)).toBeUndefined();
	});

	it("rejects three tiers", () => {
		expect(checkNameProblem("sentinel:lint / code / Run eslint")).toBe(
			"must have two tiers joined by one ' / ', found 3"
		);
	});

	it("rejects one tier", () => {
		expect(checkNameProblem("Run eslint")).toBe("must have two tiers joined by one ' / ', found 1");
	});

	it("rejects a name without the prefix", () => {
		expect(checkNameProblem("lint:code / Run eslint")).toBe(
			`"lint:code" must start with "${SENTINEL_CHECK_PREFIX}"`
		);
		expect(checkNameProblem("Static Analysis / Run eslint")).toBe(
			`"Static Analysis" must start with "${SENTINEL_CHECK_PREFIX}"`
		);
	});

	it("rejects a task id that is not lowercase words joined by ':' or '-'", () => {
		const problem = (id: string) => `task id "${id}" must be lowercase words joined by ':' or '-'`;
		expect(checkNameProblem("sentinel:Lint:code / Run eslint")).toBe(problem("Lint:code"));
		expect(checkNameProblem("sentinel:lint code / Run eslint")).toBe(problem("lint code"));
		expect(checkNameProblem("sentinel:lint: / Run eslint")).toBe(problem("lint:"));
		expect(checkNameProblem("sentinel: / Run eslint")).toBe(problem(""));
	});

	it("rejects an action that does not start with an allowed verb", () => {
		const problem = (action: string) =>
			`action "${action}" must start with one of Run, Validate followed by what it acts on`;
		expect(checkNameProblem("sentinel:lint:code / run eslint")).toBe(problem("run eslint"));
		expect(checkNameProblem("sentinel:lint:code / eslint")).toBe(problem("eslint"));
		expect(checkNameProblem("sentinel:lint:code / Run")).toBe(problem("Run"));
	});

	it("rejects a capitalised word that is not an allowed verb", () => {
		const problem = (action: string) =>
			`action "${action}" must start with one of Run, Validate followed by what it acts on`;
		expect(checkNameProblem("sentinel:lint:code / Eslint results")).toBe(problem("Eslint results"));
		expect(checkNameProblem("sentinel:lint:code / Static Analysis")).toBe(problem("Static Analysis"));
		expect(checkNameProblem("sentinel:lint:code / Lint the code")).toBe(problem("Lint the code"));
	});

	it("keeps the event suffix out of the verb check but in the message", () => {
		expect(checkNameProblem("sentinel:validate:config / Check config (pull_request)")).toBe(
			'action "Check config (pull_request)" must start with one of Run, Validate followed by what it acts on'
		);
	});

	it("lists the allowed verbs, so a new verb is a deliberate edit", () => {
		expect(CHECK_ACTION_VERBS).toEqual(["Run", "Validate"]);
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

	it.each(names)("%s has the prefix, a task id and the action rule", (_key, name) => {
		expect(checkNameProblem(name)).toBeUndefined();
	});

	it("keeps every name off the Actions checks' own names, so the ci aggregate never counts one", () => {
		for (const [, name] of names) expect(name.startsWith(SENTINEL_CHECK_PREFIX)).toBe(true);
	});
});
