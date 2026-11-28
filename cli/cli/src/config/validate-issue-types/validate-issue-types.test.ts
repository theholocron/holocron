import { ConfigError } from "@theholocron/kyber/config";
import { describe, expect, it } from "vitest";

import { validateIssueTypes } from "./validate-issue-types.js";

const problem = (value: unknown, at?: string) => {
	try {
		validateIssueTypes(value, at);
	} catch (err) {
		expect(err).toBeInstanceOf(ConfigError);
		return (err as Error).message;
	}
	return undefined;
};

describe("validateIssueTypes", () => {
	it("returns a valid list, trimming names and keeping only what was stated", () => {
		expect(
			validateIssueTypes([
				{ name: " Epic ", color: "purple", label: "epic" },
				{ name: "Bug", description: "A problem", enabled: false, commit: "fix" },
			])
		).toEqual([
			{ name: "Epic", color: "purple", label: "epic" },
			{ name: "Bug", description: "A problem", enabled: false, commit: "fix" },
		]);
	});

	it("accepts an empty list", () => {
		expect(validateIssueTypes([])).toEqual([]);
	});

	it("refuses what is not a list or an object", () => {
		expect(problem({})).toMatch(/must be a list/);
		expect(problem(["Bug"])).toMatch(/issueTypes\[0\] must be an object/);
	});

	it("names the file and the entry in the error", () => {
		expect(problem([{ name: "A" }, { color: "red" }], ".holocron/org.ts")).toMatch(
			/\.holocron\/org\.ts\[1\]: "name" must be a non-empty string/
		);
	});

	it("refuses a name that repeats ignoring case", () => {
		expect(problem([{ name: "Epic" }, { name: "epic" }])).toMatch(/repeats an earlier Type/);
	});

	it("refuses a colour GitHub does not take, and an unknown commit type", () => {
		expect(problem([{ name: "A", color: "teal" }])).toMatch(/"color" must be one of gray, blue/);
		expect(problem([{ name: "A", commit: "wip" }])).toMatch(/"commit" must be a Conventional Commit type/);
	});

	it("refuses an unknown key and values of the wrong kind", () => {
		expect(problem([{ name: "A", colour: "red" }])).toMatch(/"colour" is not an issue Type option/);
		expect(problem([{ name: "A", description: "" }])).toMatch(/"description" must be a non-empty string/);
		expect(problem([{ name: "A", label: 3 }])).toMatch(/"label" must be a non-empty string/);
		expect(problem([{ name: "A", enabled: "yes" }])).toMatch(/"enabled" must be true or false/);
	});
});
