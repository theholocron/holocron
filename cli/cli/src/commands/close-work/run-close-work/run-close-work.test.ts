import { stripVTControlCharacters } from "node:util";

import { describe, expect, it, vi } from "vitest";

const inquirerConfirm = vi.hoisted(() => vi.fn());
vi.mock("@inquirer/prompts", () => ({ confirm: inquirerConfirm }));

import { NonInteractiveError } from "@theholocron/kyber/ui";

import type { PullRequestChecks } from "../../../plugin/index.js";
import { fakeLoader, loadedWith, record } from "../../migrate/migrate.testing.js";
import { runCloseWork } from "./run-close-work.js";
import type { RunCloseWorkInput } from "./run-close-work.type.js";

const pr = (number: number, branch: string, over: Record<string, unknown> = {}) => ({
	number,
	title: "feat: x",
	state: "open" as const,
	merged: false,
	branch,
	headSha: "head123",
	url: `https://x/pull/${number}`,
	...over,
});
const green: PullRequestChecks = { state: "success", sha: "abcdef0123", failing: [] };

const sourceFake = (over: Record<string, unknown> = {}) => ({
	providerName: "github",
	listPullRequests: vi.fn(async (state: string) =>
		state === "open" ? [pr(7, "feat/12-do-it"), pr(3, "fix/99-other")] : []
	),
	getPullRequest: vi.fn(async (n: number) => pr(n, "odd-branch")),
	getPullRequestChecks: vi.fn(async () => green),
	markReady: vi.fn(async () => true),
	updatePullRequest: vi.fn(async () => ({
		pullRequest: pr(7, "feat/12-do-it"),
		created: false,
		draft: false,
		dropped: [],
	})),
	listPullRequestFiles: vi.fn(async () => [".notes/tool-x.spec.md", "cli/a.ts"]),
	...over,
});
const issuesFake = (over: Record<string, unknown> = {}) => ({
	providerName: "github",
	export: vi.fn(async () => [record("#12")]),
	...over,
});

/** A git that knows one worktree and answers the probes the clean-up makes. */
function gitFake(over: { unpushed?: number; remote?: string; branches?: string } = {}) {
	const calls: string[] = [];
	const git = (args: readonly string[]) => {
		calls.push(args.join(" "));
		const [a, b] = args;
		if (a === "worktree" && b === "list")
			return "worktree /main\nHEAD 0\nbranch refs/heads/alpha\n\nworktree /wt/work\nHEAD 1\nbranch refs/heads/feat/12-do-it\n";
		if (a === "status") return "";
		if (a === "rev-parse" && b === "--verify") return "sha";
		if (a === "rev-parse") return "head123";
		if (a === "rev-list") return String(over.unpushed ?? 0);
		if (a === "ls-remote") return over.remote ?? "";
		if (a === "for-each-ref") return over.branches ?? "alpha\nfeat/12-do-it";
		return "";
	};
	return { git, calls, writes: () => calls.filter((c) => /^(worktree remove|branch -D)/.test(c)) };
}

const okRows = (id: string) => ({
	status: "ok" as const,
	rows: [{ id, title: id, status: "ok" as const, detail: "done", problems: [] }],
});

async function run(
	options: Omit<Partial<RunCloseWorkInput>, "git"> & {
		issues?: ReturnType<typeof issuesFake>;
		source?: ReturnType<typeof sourceFake>;
		git?: ReturnType<typeof gitFake>;
		answers?: boolean[];
	} = {}
) {
	const { issues = issuesFake(), source = sourceFake(), git = gitFake(), answers, ...rest } = options;
	const lines: string[] = [];
	const updateWork = vi.fn(async (_input: unknown) => okRows("area labels"));
	const updateIssue = vi.fn(async (_input: unknown) => okRows("#12"));
	const withdrawSpecs = vi.fn(async (_files: string[]) => ({ ok: true, detail: "withdrew the post" }));
	const queue = [...(answers ?? [])];
	const confirm = vi.fn(async (_message: string) => queue.shift() ?? true);
	const input = {
		issue: "#12",
		loaded: loadedWith({ issues: "github", source: "github", projects: "github" }),
		context: { repoRoot: "/main" },
		loader: fakeLoader({ issues, source }),
		git: git.git,
		interactive: true,
		confirm,
		updateWork,
		updateIssue,
		withdrawSpecs,
		print: (l: string) => void lines.push(stripVTControlCharacters(l)),
		now: () => 0,
		sleep: async () => {},
		...rest,
	} as RunCloseWorkInput;
	const report = await runCloseWork(input);
	return { report, text: lines.join("\n"), issues, source, git, updateWork, updateIssue, withdrawSpecs, confirm };
}

describe("runCloseWork on an open pull request", () => {
	it("marks it ready when the aggregate is green, then updates the area labels and the relations", async () => {
		const { report, source, updateWork, text, confirm } = await run({ yes: true });
		expect(source.markReady).toHaveBeenCalledWith(7);
		expect(updateWork).toHaveBeenCalledWith(expect.objectContaining({ issue: "#12", pullRequest: 7, yes: true }));
		expect(report).toMatchObject({ status: "ok", pullRequest: { number: 7, state: "open" } });
		expect(text).toContain("green on abcdef0");
		expect(text).toContain("The maintainer merges");
		expect(text).toContain("labels: area labels");
		expect(confirm).not.toHaveBeenCalled();
		// It never merges.
		expect(Object.keys(source)).not.toContain("mergePullRequest");
	});

	it("asks once before it writes, and a no writes nothing", async () => {
		const asked = await run({ answers: [false] });
		expect(asked.report.status).toBe("cancelled");
		expect(asked.confirm).toHaveBeenCalledTimes(1);
		expect(asked.source.markReady).not.toHaveBeenCalled();
		expect(asked.updateWork).not.toHaveBeenCalled();
	});

	it("stops, naming the failing checks, when the aggregate is red", async () => {
		const source = sourceFake({
			getPullRequestChecks: vi.fn(async () => ({
				state: "failure",
				sha: "abc",
				failing: [{ name: "lint:code / Conclusion", url: "https://x/run/1" }],
			})),
		});
		const { report, text } = await run({ source, yes: true });
		expect(report.status).toBe("fail");
		expect(text).toContain("lint:code / Conclusion (https://x/run/1)");
		expect(source.markReady).not.toHaveBeenCalled();
	});

	it("does not wait without --wait: a running aggregate is a failure that names --wait", async () => {
		const source = sourceFake({ getPullRequestChecks: vi.fn(async () => ({ state: "pending", failing: [] })) });
		const { report, text } = await run({ source, yes: true });
		expect(report.status).toBe("fail");
		expect(text).toContain("--wait polls until it is green");
		expect(source.getPullRequestChecks).toHaveBeenCalledTimes(1);
	});

	it("with --wait polls the aggregate again each time until it is green", async () => {
		const states = ["none", "pending", "success"];
		const source = sourceFake({
			getPullRequestChecks: vi.fn(async () => ({ state: states.shift(), failing: [] })),
		});
		const { report, text } = await run({ source, yes: true, wait: true });
		expect(source.getPullRequestChecks).toHaveBeenCalledTimes(3);
		expect(source.markReady).toHaveBeenCalledTimes(1);
		expect(report.status).toBe("ok");
		expect(text).toContain("waiting: ci / Required checks is none (read 1)");
	});

	it("with --wait gives up at the timeout and says how long it waited", async () => {
		let t = 0;
		const source = sourceFake({ getPullRequestChecks: vi.fn(async () => ({ state: "pending", failing: [] })) });
		const { report, text } = await run({
			source,
			yes: true,
			wait: true,
			timeoutMinutes: 1,
			intervalMs: 30_000,
			now: () => t,
			sleep: async (ms) => void (t += ms),
		});
		expect(report.status).toBe("fail");
		expect(text).toContain("still pending after 1 minute");
		expect(source.markReady).not.toHaveBeenCalled();
	});

	it("says the pull request was already ready on a second run", async () => {
		const { text, report } = await run({ yes: true, source: sourceFake({ markReady: vi.fn(async () => false) }) });
		expect(text).toContain("#7 was already ready");
		expect(report.status).toBe("ok");
	});

	it("previews with --dry-run: reads, asks nothing, writes nothing", async () => {
		const { text, source, updateWork } = await run({ context: { repoRoot: "/main", dryRun: true } });
		expect(text).toContain("would mark #7 ready");
		expect(source.markReady).not.toHaveBeenCalled();
		// The labels step still runs, in its own dry run.
		expect(updateWork).toHaveBeenCalledWith(
			expect.objectContaining({ context: expect.objectContaining({ dryRun: true }) })
		);
	});

	it("keeps going after a step fails, and reports each", async () => {
		const { report, text, updateWork } = await run({
			yes: true,
			source: sourceFake({
				markReady: vi.fn(async () => {
					throw new Error("scope missing");
				}),
			}),
		});
		expect(report.status).toBe("fail");
		expect(text).toContain("could not mark #7 ready: scope missing");
		expect(updateWork).toHaveBeenCalled();
	});

	it("reports an area label step that throws, and unblocks a closed blocker", async () => {
		const issues = issuesFake({
			export: vi.fn(async (sel: { keys?: string[] }) =>
				sel.keys?.[0] === "#12" ? [record("#12", { blockedBy: ["#3"] })] : [record("#3", { closed: true })]
			),
		});
		const { text, updateIssue } = await run({
			issues,
			yes: true,
			updateWork: async () => {
				throw new Error("boom");
			},
		});
		expect(text).toContain("could not update the area labels: boom");
		expect(updateIssue).toHaveBeenCalledWith(expect.objectContaining({ key: "#12", unblock: ["#3"], yes: true }));
	});

	it("fails when the provider cannot read checks or mark ready", async () => {
		const noChecks = await run({ yes: true, source: sourceFake({ getPullRequestChecks: undefined }) });
		expect(noChecks.text).toContain("cannot read a pull request's checks");
		const noReady = await run({ yes: true, source: sourceFake({ markReady: undefined }) });
		expect(noReady.text).toContain("cannot mark a pull request ready");
	});

	it("fails when the aggregate cannot be read", async () => {
		const source = sourceFake({
			getPullRequestChecks: vi.fn(async () => {
				throw new Error("rate limited");
			}),
		});
		const { text } = await run({ source, yes: true });
		expect(text).toContain("could not read the aggregate: rate limited");
	});
});

describe("runCloseWork after the merge", () => {
	const merged = (extra: Record<string, unknown> = {}) =>
		sourceFake({
			listPullRequests: vi.fn(async (state: string) =>
				state === "open" ? [] : [pr(7, "feat/12-do-it", { state: "closed", merged: true, ...extra })]
			),
		});

	it("removes the worktree and the local branch and reports the remote branch gone", async () => {
		const git = gitFake();
		const { report, text, source } = await run({ source: merged(), git, yes: true });
		expect(git.writes()).toEqual(["worktree remove /wt/work", "branch -D feat/12-do-it"]);
		expect(text).toContain("#7 merged");
		expect(text).toContain("feat/12-do-it is gone from origin");
		expect(report).toMatchObject({ status: "ok", pullRequest: { state: "merged" } });
		expect(source.markReady).not.toHaveBeenCalled();
	});

	it("asks before removing, and a no removes nothing", async () => {
		const git = gitFake();
		const { report } = await run({ source: merged(), git, answers: [false] });
		expect(report.status).toBe("cancelled");
		expect(git.writes()).toEqual([]);
	});

	it("writes nothing on --dry-run, local git included", async () => {
		const git = gitFake();
		const { text } = await run({ source: merged(), git, context: { repoRoot: "/main", dryRun: true } });
		expect(git.writes()).toEqual([]);
		expect(text).toContain("would remove /wt/work");
	});

	it("keeps the worktree and branch with --keep-worktree", async () => {
		const git = gitFake();
		await run({ source: merged(), git, yes: true, keepWorktree: true });
		expect(git.writes()).toEqual([]);
	});

	it("leaves a pull request closed without merging alone and points at --abandon", async () => {
		const source = sourceFake({
			listPullRequests: vi.fn(async (state: string) =>
				state === "open" ? [] : [pr(7, "feat/12-do-it", { state: "closed" })]
			),
		});
		const git = gitFake();
		const { text } = await run({ source, git, yes: true });
		expect(text).toContain("closed without merging");
		expect(git.writes()).toEqual([]);
	});

	it("fails when no pull request is found", async () => {
		const source = sourceFake({ listPullRequests: vi.fn(async () => []) });
		const { report, text } = await run({ source, yes: true });
		expect(report.status).toBe("fail");
		expect(text).toContain("no pull request for #12");
	});
});

describe("runCloseWork --abandon", () => {
	it("closes the pull request, withdraws the spec's post and removes the worktree and branch", async () => {
		const git = gitFake();
		const { report, source, withdrawSpecs, text } = await run({ abandon: true, yes: true, git });
		expect(source.updatePullRequest).toHaveBeenCalledWith(7, { state: "closed" });
		expect(withdrawSpecs).toHaveBeenCalledWith([".notes/tool-x.spec.md"]);
		expect(git.writes()).toEqual(["worktree remove /wt/work", "branch -D feat/12-do-it"]);
		expect(report.status).toBe("ok");
		// --yes does not close the issue.
		expect(text).toContain("left open: --yes does not close an issue");
	});

	it("always asks first, and a no changes nothing", async () => {
		const git = gitFake();
		const { report, source, withdrawSpecs, confirm } = await run({ abandon: true, git, answers: [false] });
		expect(report.status).toBe("cancelled");
		expect(confirm).toHaveBeenCalledTimes(1);
		expect(source.updatePullRequest).not.toHaveBeenCalled();
		expect(withdrawSpecs).not.toHaveBeenCalled();
		expect(git.writes()).toEqual([]);
	});

	it("closes the issue as not planned when the person says yes to the second question", async () => {
		const { updateIssue, text } = await run({ abandon: true, answers: [true, true] });
		expect(updateIssue).toHaveBeenCalledWith(
			expect.objectContaining({ key: "#12", state: "closed", stateReason: "not_planned" })
		);
		expect(text).toContain("issue: #12");
	});

	it("leaves the issue open on a no", async () => {
		const { updateIssue, text } = await run({ abandon: true, answers: [true, false] });
		expect(updateIssue).not.toHaveBeenCalled();
		expect(text).toContain("#12 left open");
	});

	it("stops, changing nothing, when the branch holds unpushed commits", async () => {
		const git = gitFake({ unpushed: 2 });
		const { report, source, text, confirm } = await run({ abandon: true, yes: true, git });
		expect(report.status).toBe("fail");
		expect(text).toContain("holds 2 commits no remote branch has");
		expect(source.updatePullRequest).not.toHaveBeenCalled();
		expect(confirm).not.toHaveBeenCalled();
		expect(git.writes()).toEqual([]);
	});

	it("previews with --dry-run: no question, no write", async () => {
		const git = gitFake();
		const { source, withdrawSpecs, text, confirm } = await run({
			abandon: true,
			git,
			context: { repoRoot: "/main", dryRun: true },
		});
		expect(confirm).not.toHaveBeenCalled();
		expect(source.updatePullRequest).not.toHaveBeenCalled();
		expect(git.writes()).toEqual([]);
		expect(withdrawSpecs).toHaveBeenCalled();
		expect(text).toContain("would close #7");
		expect(text).toContain("would ask whether to close #12 as not planned");
	});

	it("finds the branch of the issue when there is no open pull request, and says so when there is none", async () => {
		const noPr = sourceFake({ listPullRequests: vi.fn(async () => []) });
		const git = gitFake();
		const { text } = await run({ abandon: true, yes: true, source: noPr, git });
		expect(text).toContain("no open pull request for #12");
		expect(git.writes()).toEqual(["worktree remove /wt/work", "branch -D feat/12-do-it"]);
		const none = await run({ abandon: true, yes: true, source: noPr, git: gitFake({ branches: "alpha" }) });
		expect(none.text).toContain("no local branch is named for #12");
		const many = await run({
			abandon: true,
			yes: true,
			source: noPr,
			git: gitFake({ branches: "feat/12-a\nfix/12-b" }),
		});
		expect(many.report.status).toBe("fail");
		expect(many.text).toContain("2 branches are named for #12");
	});

	it("keeps going when closing the pull request or withdrawing the post fails", async () => {
		const source = sourceFake({
			updatePullRequest: vi.fn(async () => {
				throw new Error("403");
			}),
		});
		const git = gitFake();
		const { report, text } = await run({
			abandon: true,
			yes: true,
			source,
			git,
			withdrawSpecs: async () => ({ ok: false, detail: "no forum" }),
		});
		expect(report.status).toBe("fail");
		expect(text).toContain("could not close #7: 403");
		expect(text).toContain("no forum");
		expect(git.writes()).toContain("branch -D feat/12-do-it");
	});

	it("says when the pull request holds no spec", async () => {
		const source = sourceFake({ listPullRequestFiles: vi.fn(async () => ["cli/a.ts"]) });
		const { text, withdrawSpecs } = await run({ abandon: true, yes: true, source });
		expect(withdrawSpecs).not.toHaveBeenCalled();
		expect(text).toContain("holds no spec or ADR");
	});

	it("does not close a pull request that is already closed (--pr)", async () => {
		const source = sourceFake({
			getPullRequest: vi.fn(async (n: number) => pr(n, "feat/12-do-it", { state: "closed" })),
		});
		const { text, source: used } = await run({ abandon: true, yes: true, source, pullRequest: 7 });
		expect(used.updatePullRequest).not.toHaveBeenCalled();
		expect(text).toContain("#7 is already closed");
	});

	it("refuses --wait and --timeout", async () => {
		const { report, text } = await run({ abandon: true, wait: true });
		expect(report.status).toBe("fail");
		expect(text).toContain("--wait and --timeout");
	});
});

describe("runCloseWork checks", () => {
	it("throws NonInteractiveError without --yes, --dry-run or a terminal", async () => {
		await expect(run({ interactive: false })).rejects.toBeInstanceOf(NonInteractiveError);
		await expect(run({ interactive: false, abandon: true })).rejects.toBeInstanceOf(NonInteractiveError);
		const dry = await run({ interactive: false, context: { repoRoot: "/main", dryRun: true } });
		expect(dry.report.status).toBe("ok");
	});

	it("rejects an empty issue and a bad timeout, and a missing provider", async () => {
		expect((await run({ issue: " " })).report.status).toBe("fail");
		expect((await run({ timeoutMinutes: 0, wait: true })).text).toContain(
			"--timeout is a number of minutes above zero"
		);
		const noIssues = await run({ loaded: loadedWith({ source: "github" }) });
		expect(noIssues.text).toContain("no `issues` provider");
		const noSource = await run({ loaded: loadedWith({ issues: "github" }) });
		expect(noSource.text).toContain("no `source` provider");
	});

	it("says a provider failed to load", async () => {
		const { text } = await run({
			loader: fakeLoader({ issues: issuesFake() }, { source: "bad token" }),
			yes: true,
		});
		expect(text).toContain("the `source` provider is not available (bad token)");
	});

	it("uses --pr for a pull request whose branch is named another way", async () => {
		const source = sourceFake();
		const { report } = await run({ source, yes: true, pullRequest: 5 });
		expect(source.getPullRequest).toHaveBeenCalledWith(5);
		expect(report.pullRequest?.number).toBe(5);
	});

	it("reports a provider that cannot list or a lookup that throws", async () => {
		const cannot = await run({ yes: true, source: sourceFake({ listPullRequests: undefined }) });
		expect(cannot.text).toContain("cannot list pull requests");
		const throws = await run({
			yes: true,
			source: sourceFake({
				listPullRequests: vi.fn(async () => {
					throw new Error("down");
				}),
			}),
		});
		expect(throws.text).toContain("could not find the pull request: down");
		const noGet = await run({ yes: true, pullRequest: 2, source: sourceFake({ getPullRequest: undefined }) });
		expect(noGet.text).toContain("cannot read a pull request");
	});

	it("names several matching open pull requests and takes the newest", async () => {
		const source = sourceFake({
			listPullRequests: vi.fn(async (state: string) =>
				state === "open" ? [pr(9, "feat/12-b"), pr(7, "feat/12-a")] : []
			),
		});
		const { text } = await run({ source, yes: true });
		expect(text).toContain("2 open pull requests match #12; using #9");
	});
});
