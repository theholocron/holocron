import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { workflowNameProblems } from "./workflow-name-problems.js";

const listing = (...names: string[]) =>
	`on:\n  workflow_run:\n    workflows:\n${names.map((n) => `      - ${n}\n`).join("")}    types: [completed]\n`;

describe("workflowNameProblems", () => {
	it("accepts task ids, with a colon or a hyphen, and a hand-written workflow's own name", () => {
		expect(workflowNameProblems(listing("test:unit", "deploy-docs", "release", "Sentinel Deploy"))).toEqual([]);
	});

	it("reads quoted names", () => {
		expect(workflowNameProblems(listing('"lint:code"', "'Verification'"))).toEqual([
			"Verification: an old group name; a caller's workflow is named for its task id",
		]);
	});

	it("names an old group name, an old task name and an id that no task has", () => {
		expect(workflowNameProblems(listing("Delivery", "stale", "no-such-task"))).toEqual([
			"Delivery: an old group name; a caller's workflow is named for its task id",
			"stale: an old task name; a caller's workflow is named for its task id",
			"no-such-task: no task has this id, so no run carries this workflow name",
		]);
	});

	it("finds nothing in a file that lists no workflows", () => {
		expect(workflowNameProblems("on:\n  push:\n")).toEqual([]);
	});

	it("passes this repo's own platform.notifications.yml", () => {
		const own = readFileSync(
			new URL("../../../../../.github/workflows/platform.notifications.yml", import.meta.url),
			"utf8"
		);
		expect(workflowNameProblems(own)).toEqual([]);
	});
});
