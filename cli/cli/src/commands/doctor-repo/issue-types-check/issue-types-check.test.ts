import { describe, expect, it } from "vitest";

import type { IssueTypeInfo } from "../../../plugin/index.js";
import { compareIssueTypes } from "./issue-types-check.js";

const type = (over: Partial<IssueTypeInfo> = {}): IssueTypeInfo => ({
	id: 1,
	name: "Bug",
	description: "Something broke",
	color: "red",
	enabled: true,
	...over,
});

describe("compareIssueTypes", () => {
	it("matches names, descriptions and colours ignoring case", () => {
		const result = compareIssueTypes([{ name: "bug", description: "Something broke", color: "RED" }], [type()]);
		expect(result).toEqual({ problems: [], checked: 1, info: [] });
	});

	it("fails a declared Type the organization lacks, naming the commands that make it", () => {
		const result = compareIssueTypes([{ name: "Epic" }], [type()]);
		expect(result.problems).toEqual([
			"missing issue Type Epic; run `holocron apply issue-types` (or `holocron setup`)",
		]);
		expect(result.info).toEqual(["Bug is not declared in `issueTypes`"]);
	});

	it("notes a different description and colour, was and declared, never failing", () => {
		const result = compareIssueTypes(
			[{ name: "Bug", description: "A defect", color: "blue" }],
			[type({ description: undefined, color: undefined })]
		);
		expect(result.problems).toEqual([]);
		expect(result.info).toEqual([
			'Bug description was "", declared "A defect"; `holocron apply issue-types --update` sets it',
			"Bug colour was none, declared blue; `holocron apply issue-types --update` sets it",
		]);
	});

	it("leaves a field the declaration omits alone", () => {
		expect(compareIssueTypes([{ name: "Bug" }], [type({ color: "pink" })]).info).toEqual([]);
	});

	it("notes a Type that is turned off, unless the declaration says so too", () => {
		const off = type({ enabled: false });
		expect(compareIssueTypes([{ name: "Bug" }], [off]).info).toEqual([
			"Bug is turned off in the organization's settings",
		]);
		expect(compareIssueTypes([{ name: "Bug", enabled: false }], [off]).info).toEqual([]);
	});
});
