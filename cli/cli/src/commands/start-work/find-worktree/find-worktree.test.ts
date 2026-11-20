import { describe, expect, it } from "vitest";

import { findWorktree } from "./find-worktree.js";

const LIST = [
	"worktree /r",
	"HEAD aaa",
	"branch refs/heads/alpha",
	"",
	"worktree /r/.claude/worktrees/x",
	"HEAD bbb",
	"branch refs/heads/feat/1-x",
	"",
	"worktree /r/detached",
	"HEAD ccc",
	"detached",
].join("\n");

describe("findWorktree", () => {
	it("finds the directory a branch is checked out in", () => {
		expect(findWorktree(() => LIST, "/r", "feat/1-x")).toBe("/r/.claude/worktrees/x");
		expect(findWorktree(() => LIST, "/r", "alpha")).toBe("/r");
	});

	it("has nothing for a branch checked out nowhere", () => {
		expect(findWorktree(() => LIST, "/r", "feat/other")).toBeUndefined();
	});
});
