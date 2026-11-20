import { stripVTControlCharacters } from "node:util";

import { afterEach, describe, expect, it, vi } from "vitest";

const runGit = vi.hoisted(() => vi.fn());
const runUpdateWork = vi.hoisted(() => vi.fn());
const runIssueUpdate = vi.hoisted(() => vi.fn());
const withdrawSpecs = vi.hoisted(() => vi.fn());
vi.mock("@theholocron/kyber/git", () => ({ runGit }));
vi.mock("../../update-work/run-update-work/index.js", () => ({ runUpdateWork }));
vi.mock("../../issue-update/run-issue-update/index.js", () => ({ runIssueUpdate }));
vi.mock("../withdraw-specs/index.js", () => ({ withdrawSpecs }));

import { fakeLoader, loadedWith, record } from "../../migrate/migrate.testing.js";
import { runCloseWork } from "./run-close-work.js";

const pr = (number: number, branch: string, over: Record<string, unknown> = {}) => ({
	number,
	title: "feat: x",
	state: "open" as const,
	merged: false,
	branch,
	url: `https://x/pull/${number}`,
	...over,
});

const ok = { status: "ok", rows: [] };
const base = () => {
	const lines: string[] = [];
	return {
		lines,
		input: {
			issue: "#12",
			loaded: loadedWith({ issues: "github", source: "github" }),
			context: { repoRoot: "/main" },
			yes: true,
			interactive: true,
			print: (l: string) => void lines.push(stripVTControlCharacters(l)),
		},
	};
};

afterEach(() => {
	vi.useRealTimers();
	vi.clearAllMocks();
});

describe("runCloseWork default collaborators", () => {
	it("uses the real update work and update issue, and a real timer to wait", async () => {
		vi.useFakeTimers();
		runUpdateWork.mockResolvedValue(ok);
		runIssueUpdate.mockResolvedValue(ok);
		const states = ["pending", "success"];
		const source = {
			providerName: "github",
			listPullRequests: vi.fn(async () => [pr(7, "feat/12-x")]),
			getPullRequestChecks: vi.fn(async () => ({ state: states.shift(), failing: [] })),
			markReady: vi.fn(async () => true),
		};
		const issues = {
			providerName: "github",
			export: vi.fn(async (sel: { keys?: string[] }) =>
				sel.keys?.[0] === "#12" ? [record("#12", { blockedBy: ["#3"] })] : [record("#3", { closed: true })]
			),
		};
		const { input } = base();
		const run = runCloseWork({ ...input, wait: true, loader: fakeLoader({ issues, source }) } as never);
		await vi.advanceTimersByTimeAsync(30_000);
		const report = await run;
		expect(report.status).toBe("ok");
		expect(source.getPullRequestChecks).toHaveBeenCalledTimes(2);
		expect(runUpdateWork).toHaveBeenCalledWith(expect.objectContaining({ issue: "#12", pullRequest: 7 }));
		expect(runIssueUpdate).toHaveBeenCalledWith(expect.objectContaining({ key: "#12", unblock: ["#3"] }));
	});

	it("uses the real git, the real withdraw and the real issue update when it abandons", async () => {
		runGit.mockImplementation((args: readonly string[]) => {
			if (args[0] === "for-each-ref") return "feat/12-x";
			if (args[0] === "rev-list") return "0";
			if (args[0] === "worktree") return "worktree /main\\n";
			return "";
		});
		withdrawSpecs.mockResolvedValue({ ok: true, detail: "withdrew" });
		runIssueUpdate.mockResolvedValue(ok);
		const source = {
			providerName: "github",
			listPullRequests: vi.fn(async () => [pr(7, "feat/12-x")]),
			listPullRequestFiles: vi.fn(async () => [".notes/a.spec.md"]),
			updatePullRequest: vi.fn(async () => ({})),
		};
		const { input } = base();
		const report = await runCloseWork({
			...input,
			yes: false,
			abandon: true,
			confirm: async () => true,
			loader: fakeLoader({ issues: { providerName: "github" }, source }),
		} as never);
		expect(report.status).toBe("ok");
		expect(runGit).toHaveBeenCalled();
		expect(withdrawSpecs).toHaveBeenCalledWith(expect.anything(), expect.anything(), [".notes/a.spec.md"]);
		expect(runIssueUpdate).toHaveBeenCalledWith(
			expect.objectContaining({ key: "#12", state: "closed", stateReason: "not_planned" })
		);
	});

	it("uses the real git to clean up after a merge", async () => {
		runGit.mockReturnValue("");
		const source = {
			providerName: "github",
			listPullRequests: vi.fn(async (state: string) =>
				state === "open" ? [] : [pr(7, "feat/12-x", { state: "closed", merged: true })]
			),
		};
		const { input } = base();
		await runCloseWork({ ...input, loader: fakeLoader({ issues: {}, source }) } as never);
		expect(runGit).toHaveBeenCalled();
	});
});
