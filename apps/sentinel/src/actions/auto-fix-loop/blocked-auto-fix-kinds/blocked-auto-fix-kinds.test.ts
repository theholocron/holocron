import { describe, expect, it } from "vitest";

import { AUTO_FIX_SUBJECTS } from "../auto-fix-subjects/index.js";
import { blockedAutoFixKinds } from "./blocked-auto-fix-kinds.js";

const SIGNOFF = "\n\nSigned-off-by: Holocron Sentinel <sentinel@theholocron.dev>";
const prettier = `${AUTO_FIX_SUBJECTS.formatting}${SIGNOFF}`;
const markdown = `${AUTO_FIX_SUBJECTS["markdown-lint"]}${SIGNOFF}`;
const editorconfig = `${AUTO_FIX_SUBJECTS.editorconfig}${SIGNOFF}`;

describe("blockedAutoFixKinds", () => {
	it("blocks nothing for a pull request with no auto-fix commit", () => {
		expect(blockedAutoFixKinds(["feat: a thing", "fix: another"])).toEqual([]);
		expect(blockedAutoFixKinds([])).toEqual([]);
	});

	it("blocks the kind that already committed since the last commit of a person's", () => {
		expect(blockedAutoFixKinds(["feat: a thing", markdown])).toEqual(["markdown-lint"]);
	});

	it("blocks every kind in the run, in a fixed order", () => {
		expect(blockedAutoFixKinds(["feat: a thing", editorconfig, markdown, prettier])).toEqual([
			"formatting",
			"markdown-lint",
			"editorconfig",
		]);
	});

	it("starts again after a commit of a person's, so a new unformatted line is fixed", () => {
		expect(blockedAutoFixKinds([prettier, markdown, "fix: more", "feat: later"])).toEqual([]);
		expect(blockedAutoFixKinds([prettier, "fix: more", markdown])).toEqual(["markdown-lint"]);
	});

	it("reads the thirty-four commits of #1949 as both fixers blocked", () => {
		const loop = Array.from({ length: 34 }, (_, i) => (i % 2 === 0 ? markdown : prettier));
		expect(blockedAutoFixKinds(["fix(cli): check the callers", ...loop])).toEqual(["formatting", "markdown-lint"]);
	});

	it("recognises a kind by its subject line alone, not by a message that merely mentions it", () => {
		expect(blockedAutoFixKinds([`revert: ${AUTO_FIX_SUBJECTS.formatting}`])).toEqual([]);
		expect(blockedAutoFixKinds([`${AUTO_FIX_SUBJECTS.formatting}\n\nbody that names markdownlint`])).toEqual([
			"formatting",
		]);
	});
});
