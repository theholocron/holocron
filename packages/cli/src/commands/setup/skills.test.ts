import { describe, expect, it } from "vitest";

import { AGENT_SYMLINK_PATHS, parsePreviousSkills } from "./skills.js";

describe("AGENT_SYMLINK_PATHS", () => {
	it("provides a symlink path for claude", () => {
		const fn = AGENT_SYMLINK_PATHS["claude"];
		expect(fn).toBeDefined();
		expect(fn!("my-skill")).toBe(".claude/skills/my-skill");
	});
});

describe("parsePreviousSkills", () => {
	const symlinkFn = AGENT_SYMLINK_PATHS["claude"]!;

	it("returns empty array when gitignore has no managed block", () => {
		expect(parsePreviousSkills("", symlinkFn)).toEqual([]);
		expect(parsePreviousSkills("node_modules\n.env\n", symlinkFn)).toEqual([]);
	});

	it("extracts skill names from a managed block", () => {
		const gitignore = [
			"node_modules",
			"# managed by holocron setup — skills",
			"/.agents/skills/",
			"/.claude/skills/code-review",
			"/.claude/skills/verify",
			"# end managed by holocron setup — skills",
		].join("\n");
		expect(parsePreviousSkills(gitignore, symlinkFn)).toEqual(["code-review", "verify"]);
	});

	it("returns empty array when block exists but has no skill entries", () => {
		const gitignore = [
			"# managed by holocron setup — skills",
			"/.agents/skills/",
			"# end managed by holocron setup — skills",
		].join("\n");
		expect(parsePreviousSkills(gitignore, symlinkFn)).toEqual([]);
	});

	it("handles a block with no end marker", () => {
		const gitignore = [
			"# managed by holocron setup — skills",
			"/.agents/skills/",
			"/.claude/skills/foo",
		].join("\n");
		expect(parsePreviousSkills(gitignore, symlinkFn)).toEqual(["foo"]);
	});

	it("ignores content outside the managed block", () => {
		const gitignore = [
			"/.claude/skills/not-managed",
			"# managed by holocron setup — skills",
			"/.agents/skills/",
			"/.claude/skills/managed-skill",
			"# end managed by holocron setup — skills",
			"/.claude/skills/also-not-managed",
		].join("\n");
		expect(parsePreviousSkills(gitignore, symlinkFn)).toEqual(["managed-skill"]);
	});
});
