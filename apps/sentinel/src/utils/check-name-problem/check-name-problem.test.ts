import { describe, expect, it } from "vitest";

import * as actions from "../../actions/index.js";
import { CHECK_ACTION_VERBS, checkNameProblem } from "./check-name-problem.js";

describe("checkNameProblem", () => {
	it.each([
		"lint:code / Run eslint",
		"validate:config / Run Holocron config compatibility (pull_request)",
		"validate:specs / Validate ADRs and specs",
		"typecheck / Run tsc --noEmit",
		"validate:dco / Run Developer Certificate of Origin",
		"deploy-preview / Run vercel",
	])("accepts %s", (name) => {
		expect(checkNameProblem(name)).toBeUndefined();
	});

	it("rejects three tiers", () => {
		expect(checkNameProblem("lint / code / Run eslint")).toBe("must have two tiers joined by one ' / ', found 3");
	});

	it("rejects one tier", () => {
		expect(checkNameProblem("Run eslint")).toBe("must have two tiers joined by one ' / ', found 1");
	});

	it("rejects a task id that is not lowercase words joined by ':' or '-'", () => {
		const problem = (id: string) => `task id "${id}" must be lowercase words joined by ':' or '-'`;
		expect(checkNameProblem("Lint:code / Run eslint")).toBe(problem("Lint:code"));
		expect(checkNameProblem("lint code / Run eslint")).toBe(problem("lint code"));
		expect(checkNameProblem("lint: / Run eslint")).toBe(problem("lint:"));
		expect(checkNameProblem(" / Run eslint")).toBe(problem(""));
	});

	it("rejects an action that does not start with an allowed verb", () => {
		const problem = (action: string) =>
			`action "${action}" must start with one of Run, Validate followed by what it acts on`;
		expect(checkNameProblem("lint:code / run eslint")).toBe(problem("run eslint"));
		expect(checkNameProblem("lint:code / eslint")).toBe(problem("eslint"));
		expect(checkNameProblem("lint:code / Run")).toBe(problem("Run"));
	});

	it("rejects a capitalised word that is not an allowed verb", () => {
		const problem = (action: string) =>
			`action "${action}" must start with one of Run, Validate followed by what it acts on`;
		expect(checkNameProblem("lint:code / Eslint results")).toBe(problem("Eslint results"));
		expect(checkNameProblem("lint:code / Static Analysis")).toBe(problem("Static Analysis"));
		expect(checkNameProblem("lint:code / Lint the code")).toBe(problem("Lint the code"));
	});

	it("keeps the event suffix out of the verb check but in the message", () => {
		expect(checkNameProblem("validate:config / Check config (pull_request)")).toBe(
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
	];

	it("finds all ten, so a new check cannot skip the rule", () => {
		expect(names).toHaveLength(10);
	});

	it.each(names)("%s has a task id and the action rule", (_key, name) => {
		expect(checkNameProblem(name)).toBeUndefined();
	});

	it("posts nothing under a task id that Actions owns (process-sentinel-and-actions-roles, #2263)", () => {
		const ids = names.map(([, name]) => name.split(" / ")[0]);
		for (const owned of ["lint:code", "typecheck", "test:unit", "build"]) expect(ids).not.toContain(owned);
	});
});
