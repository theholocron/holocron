import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:child_process", () => ({ spawnSync: vi.fn(() => ({ status: 1, stdout: "", stderr: "" })) }));

// Resolve packages only under the temp "repo" a test makes: NODE_PATH would otherwise reach the workspace's own hoisted packages.
vi.mock("node:module", async (importOriginal) => {
	const actual = await importOriginal<typeof import("node:module")>();
	const { hermeticCreateRequire } = await import("../../../testing/hermetic-require.js");
	return { ...actual, createRequire: hermeticCreateRequire(actual) };
});

import { spawnSync } from "node:child_process";

import { AGENT_SYMLINK_PATHS, installSkills, parsePreviousSkills } from "./skills.js";

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
		const gitignore = ["# managed by holocron setup — skills", "/.agents/skills/", "/.claude/skills/foo"].join(
			"\n"
		);
		expect(parsePreviousSkills(gitignore, symlinkFn)).toEqual(["foo"]);
	});

	it("stops an unterminated block at the next blank line, so user rules below aren't treated as skills", () => {
		const gitignore = [
			"# managed by holocron setup — skills",
			"/.agents/skills/",
			"/.claude/skills/foo",
			"",
			"# my own rules",
			"/.claude/skills/user-owned",
		].join("\n");
		expect(parsePreviousSkills(gitignore, symlinkFn)).toEqual(["foo"]);
	});

	it("doesn't let an end marker past a blank line close the block", () => {
		const gitignore = [
			"# managed by holocron setup — skills",
			"/.claude/skills/foo",
			"",
			"/.claude/skills/user-owned",
			"# end managed by holocron setup — skills",
		].join("\n");
		expect(parsePreviousSkills(gitignore, symlinkFn)).toEqual(["foo"]);
	});

	it("reads a CRLF block without carrying \\r into the names", () => {
		const gitignore = [
			"# managed by holocron setup — skills",
			"/.claude/skills/foo",
			"# end managed by holocron setup — skills",
			"",
		].join("\r\n");
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

describe("installSkills — auto-install @theholocron/skills (holocron#653)", () => {
	let repoRoot: string;
	const spy = spawnSync as ReturnType<typeof vi.fn>;

	beforeEach(async () => {
		repoRoot = await mkdtemp(join(tmpdir(), "holocron-skills-install-"));
		spy.mockClear();
	});
	afterEach(async () => {
		await rm(repoRoot, { recursive: true, force: true });
	});

	it("passes -w to pnpm add when repoRoot is a pnpm workspace root", async () => {
		await writeFile(join(repoRoot, "pnpm-workspace.yaml"), "packages:\n  - packages/*\n");

		await installSkills({ agent: "claude", skills: [], repoRoot }).catch(() => undefined);

		expect(spy).toHaveBeenCalledWith(
			"pnpm",
			["add", "-D", "-w", "@theholocron/skills"],
			expect.objectContaining({ cwd: repoRoot })
		);
	});

	it("omits -w when repoRoot is not a pnpm workspace root", async () => {
		await installSkills({ agent: "claude", skills: [], repoRoot }).catch(() => undefined);

		expect(spy).toHaveBeenCalledWith(
			"pnpm",
			["add", "-D", "@theholocron/skills"],
			expect.objectContaining({ cwd: repoRoot })
		);
	});

	it("retries with -w when pnpm-workspace.yaml appears between the check and the add (race, review on holocron#653)", async () => {
		// No pnpm-workspace.yaml at the time of the isWorkspaceRoot() check --
		// but the first pnpm add still fails as if one had appeared concurrently.
		spy.mockReturnValueOnce({ status: 1, stdout: "", stderr: "ERR_PNPM_ADDING_TO_ROOT  ..." });
		spy.mockReturnValueOnce({ status: 1, stdout: "", stderr: "" });

		await installSkills({ agent: "claude", skills: [], repoRoot }).catch(() => undefined);

		expect(spy).toHaveBeenCalledTimes(2);
		expect(spy).toHaveBeenNthCalledWith(
			1,
			"pnpm",
			["add", "-D", "@theholocron/skills"],
			expect.objectContaining({ cwd: repoRoot })
		);
		expect(spy).toHaveBeenNthCalledWith(
			2,
			"pnpm",
			["add", "-D", "-w", "@theholocron/skills"],
			expect.objectContaining({ cwd: repoRoot })
		);
	});

	it("does not retry a failure unrelated to ERR_PNPM_ADDING_TO_ROOT", async () => {
		spy.mockReturnValueOnce({ status: 1, stdout: "", stderr: "ENOTFOUND registry.npmjs.org" });

		await installSkills({ agent: "claude", skills: [], repoRoot }).catch(() => undefined);

		expect(spy).toHaveBeenCalledTimes(1);
	});
});
