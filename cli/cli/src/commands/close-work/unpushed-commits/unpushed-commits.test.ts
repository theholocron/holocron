import { describe, expect, it, vi } from "vitest";

import { unpushedCommits } from "./unpushed-commits.js";

describe("unpushedCommits", () => {
	it("counts the commits no remote branch holds", () => {
		const git = vi.fn((args: readonly string[]) => (args[0] === "rev-list" ? "3" : "abc"));
		expect(unpushedCommits(git, "/r", "feat/1-x")).toBe(3);
		expect(git).toHaveBeenCalledWith(["rev-list", "--count", "refs/heads/feat/1-x", "--not", "--remotes"], "/r");
	});

	it("is zero when everything is pushed", () => {
		expect(unpushedCommits((a) => (a[0] === "rev-list" ? "0" : "abc"), "/r", "b")).toBe(0);
	});

	it("is undefined when the branch is not here", () => {
		const git = (): string => {
			throw new Error("exit 1");
		};
		expect(unpushedCommits(git, "/r", "b")).toBeUndefined();
	});
});
