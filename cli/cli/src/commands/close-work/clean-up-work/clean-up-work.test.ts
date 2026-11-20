import { describe, expect, it } from "vitest";

import { cleanUpWork } from "./clean-up-work.js";

interface World {
	/** Worktrees as [path, branch], the first being the main checkout. */
	worktrees?: Array<[string, string]>;
	dirty?: boolean;
	branchExists?: boolean;
	tip?: string;
	unpushed?: number;
	remote?: string;
	remoteThrows?: boolean;
	removeThrows?: boolean;
}

function fakeGit(world: World = {}) {
	const worktrees = world.worktrees ?? [
		["/main", "alpha"],
		["/wt/work", "feat/1-x"],
	];
	const calls: string[][] = [];
	const git = (args: readonly string[], cwd: string): string => {
		calls.push([...args, `@${cwd}`]);
		const [a, b] = args;
		if (a === "worktree" && b === "list") {
			return worktrees
				.map(([path, branch]) => `worktree ${path}\nHEAD 000\nbranch refs/heads/${branch}\n`)
				.join("\n");
		}
		if (a === "status") return world.dirty ? " M file" : "";
		if (a === "worktree" && b === "remove") {
			if (world.removeThrows) throw new Error("fatal: cannot remove");
			return "";
		}
		if (a === "rev-parse" && b === "--verify") {
			if (world.branchExists === false) throw new Error("exit 1");
			return "sha";
		}
		if (a === "rev-parse") return world.tip ?? "aaaaaaa1111";
		if (a === "rev-list") return String(world.unpushed ?? 0);
		if (a === "branch") return "";
		if (a === "ls-remote") {
			if (world.remoteThrows) throw new Error("offline");
			return world.remote ?? "";
		}
		throw new Error(`unexpected git ${args.join(" ")}`);
	};
	return { git, calls };
}

const base = { repoRoot: "/main", branch: "feat/1-x", dryRun: false, mode: "merged" as const };
const detail = (rows: ReturnType<typeof cleanUpWork>, id: string) => rows.find((r) => r.id === id);
const wrote = (calls: string[][]) =>
	calls
		.filter((c) => (c[0] === "worktree" && c[1] === "remove") || c[0] === "branch")
		.map((c) => c.slice(0, -1).join(" "));

describe("cleanUpWork", () => {
	it("removes the worktree and the local branch and says the remote branch is gone", () => {
		const { git, calls } = fakeGit();
		const rows = cleanUpWork({ ...base, git });
		expect(rows.map((r) => [r.id, r.status])).toEqual([
			["worktree", "ok"],
			["local branch", "ok"],
			["remote branch", "ok"],
		]);
		expect(wrote(calls)).toEqual(["worktree remove /wt/work", "branch -D feat/1-x"]);
	});

	it("is a no-op the second time: nothing to remove", () => {
		const { git, calls } = fakeGit({ worktrees: [["/main", "alpha"]], branchExists: false });
		const rows = cleanUpWork({ ...base, git });
		expect(rows.map((r) => r.status)).toEqual(["skip", "skip", "ok"]);
		expect(wrote(calls)).toEqual([]);
	});

	it("writes nothing on a dry run, local git included", () => {
		const { git, calls } = fakeGit();
		const rows = cleanUpWork({ ...base, git, dryRun: true });
		expect(detail(rows, "worktree")?.detail).toBe("would remove /wt/work");
		expect(detail(rows, "local branch")?.detail).toBe("would delete feat/1-x");
		expect(wrote(calls)).toEqual([]);
	});

	it("keeps the worktree and so the branch with --keep-worktree", () => {
		const { git, calls } = fakeGit();
		const rows = cleanUpWork({ ...base, git, keepWorktree: true });
		expect(detail(rows, "worktree")?.detail).toContain("--keep-worktree");
		expect(detail(rows, "local branch")?.detail).toContain("its worktree is kept");
		expect(wrote(calls)).toEqual([]);
	});

	it("refuses a worktree with uncommitted changes and keeps the branch", () => {
		const { git, calls } = fakeGit({ dirty: true });
		const rows = cleanUpWork({ ...base, git });
		expect(detail(rows, "worktree")).toMatchObject({ status: "fail" });
		expect(detail(rows, "local branch")?.status).toBe("skip");
		expect(wrote(calls)).toEqual([]);
	});

	it("never removes the main checkout or the worktree it is running in", () => {
		const main = fakeGit({ worktrees: [["/main", "feat/1-x"]] });
		const rows = cleanUpWork({ ...base, git: main.git });
		expect(detail(rows, "worktree")?.detail).toContain("main checkout");
		expect(wrote(main.calls)).toEqual([]);
		const inside = fakeGit();
		const there = cleanUpWork({ ...base, git: inside.git, repoRoot: "/wt/work/sub" });
		expect(detail(there, "worktree")?.detail).toContain("where this command is running");
		expect(wrote(inside.calls)).toEqual([]);
	});

	it("reports a failed removal and leaves the branch", () => {
		const { git } = fakeGit({ removeThrows: true });
		const rows = cleanUpWork({ ...base, git });
		expect(detail(rows, "worktree")).toMatchObject({ status: "fail" });
		expect(detail(rows, "local branch")?.detail).toContain("could not be removed");
	});

	it("deletes a squash-merged branch only when its tip is the pull request's head", () => {
		const yes = fakeGit({ unpushed: 2, tip: "head123" });
		expect(detail(cleanUpWork({ ...base, git: yes.git, headSha: "head123" }), "local branch")?.status).toBe("ok");
		const no = fakeGit({ unpushed: 2, tip: "other" });
		const rows = cleanUpWork({ ...base, git: no.git, headSha: "head123" });
		expect(detail(rows, "local branch")?.status).toBe("fail");
		expect(wrote(no.calls)).toEqual(["worktree remove /wt/work"]);
	});

	it("deletes an abandoned branch whatever its tip, the caller having refused unpushed work", () => {
		const { git } = fakeGit({ unpushed: 2 });
		expect(detail(cleanUpWork({ ...base, git, mode: "abandoned" }), "local branch")?.status).toBe("ok");
	});

	it("only checks the remote branch: still there is a skip with the command, an offline origin a skip", () => {
		const there = cleanUpWork({ ...base, git: fakeGit({ remote: "abc\trefs/heads/feat/1-x" }).git });
		expect(detail(there, "remote branch")?.detail).toContain("git push origin --delete feat/1-x");
		const offline = cleanUpWork({ ...base, git: fakeGit({ remoteThrows: true }).git });
		expect(detail(offline, "remote branch")).toMatchObject({ status: "skip" });
	});

	it("reports a git failure while listing worktrees", () => {
		const git = () => {
			throw new Error("not a repository");
		};
		const rows = cleanUpWork({ ...base, git });
		expect(rows.map((r) => r.status)).toEqual(["fail", "skip", "skip"]);
	});
});
