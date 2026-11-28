import { describe, expect, it } from "vitest";

import { PRERELEASE_CHANNEL, RELEASE_BRANCHES } from "../../release-branches/index.js";
import { WORKFLOW_TEMPLATES } from "./github-action-thin-callers.js";

/** Every `branches: [a, b]` flow list and `branches:\n - a\n - b` block list in a template, as arrays of names. */
function branchLists(text: string): string[][] {
	const lists: string[][] = [];
	for (const match of text.matchAll(/^ {4}branches: \[(.*)\]$/gm)) {
		lists.push((match[1] ?? "").split(",").map((name) => name.trim()));
	}
	for (const match of text.matchAll(/^ {4}branches:\n((?: {6}- .+\n)+)/gm)) {
		lists.push(
			(match[1] ?? "")
				.trim()
				.split("\n")
				.map((line) => line.replace(/^\s*- /, "").trim())
		);
	}
	return lists;
}

// The templates are plain YAML copied into generated workflows, so they cannot import RELEASE_BRANCHES; this keeps
// each copy of the release-branch list honest. A list of just `main` (docs, preview and deploy runs) is a different
// concept, the default branch, and is left alone.
describe("workflow templates: release branches", () => {
	const templates = Object.entries(WORKFLOW_TEMPLATES);

	it("finds templates that spell the release branches", () => {
		const withAlpha = templates.filter(([, text]) => branchLists(text).some((list) => list.includes("alpha")));
		expect(withAlpha.length).toBeGreaterThan(10);
	});

	it.each(templates)("%s lists the release branches exactly when it lists alpha", (_id, text) => {
		const spelled = branchLists(text).filter((list) => list.includes(PRERELEASE_CHANNEL));
		expect(spelled.every((list) => list.join() === RELEASE_BRANCHES.join())).toBe(true);
	});

	it("reads both the flow and the block form of a branch list", () => {
		expect(branchLists("on:\n  push:\n    branches: [main, alpha]\n")).toEqual([["main", "alpha"]]);
		expect(branchLists("on:\n  push:\n    branches:\n      - main\n      - alpha\n")).toEqual([["main", "alpha"]]);
	});
});
