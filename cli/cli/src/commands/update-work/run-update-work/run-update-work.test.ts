import { stripVTControlCharacters } from "node:util";

import { describe, expect, it, vi } from "vitest";

const inquirerConfirm = vi.hoisted(() => vi.fn());
vi.mock("@inquirer/prompts", () => ({ confirm: inquirerConfirm }));
const defaults = vi.hoisted(() => ({ updateIssue: vi.fn(), setStatus: vi.fn(), startWork: vi.fn() }));
vi.mock("../../issue-update/run-issue-update/index.js", () => ({ runIssueUpdate: defaults.updateIssue }));
vi.mock("../../project/project-status/index.js", () => ({ runProjectStatus: defaults.setStatus }));
vi.mock("../../start-work/run-start-work/index.js", () => ({ runStartWork: defaults.startWork }));

import { NonInteractiveError } from "@theholocron/kyber/ui";

import type { LoadedConfig } from "../../../config/index.js";
import { fakeLoader, loadedWith } from "../../migrate/migrate.testing.js";
import { runUpdateWork } from "./run-update-work.js";
import type { RunUpdateWorkInput } from "./run-update-work.type.js";

const AREAS = { cli: ["cli/**"], docs: ["docs/**", "!docs/wiki/**"], specs: ["docs/wiki/**"] };

const pr = (number: number, branch: string) => ({
	number,
	title: "feat: x",
	state: "open" as const,
	merged: false,
	branch,
	url: `https://x/pull/${number}`,
});

const issuesFake = (over: Record<string, unknown> = {}) => ({
	providerName: "github",
	export: vi.fn(async () => [{ key: "#12", labels: ["enhancement", "area:cli"] }]),
	...over,
});
const sourceFake = (over: Record<string, unknown> = {}) => ({
	providerName: "github",
	listPullRequests: vi.fn(async () => [pr(7, "feat/12-do-it"), pr(3, "fix/99-other")]),
	getPullRequest: vi.fn(async (n: number) => pr(n, "odd-branch")),
	listPullRequestFiles: vi.fn(async (_number: number) => ["cli/cli/a.ts", "docs/a.md", "package.json"]),
	updatePullRequest: vi.fn(async (_number: number, _patch: unknown) => ({
		pullRequest: pr(7, "feat/12-do-it"),
		created: false,
		draft: true,
		dropped: [] as string[],
	})),
	...over,
});
const updateIssueOk = () =>
	vi.fn(async () => ({
		status: "ok" as const,
		rows: [{ id: "#12", title: "#12", status: "ok" as const, detail: "updated", problems: [] }],
	}));

function config(areas: Record<string, string[]> | null): LoadedConfig {
	const loaded = loadedWith({ issues: "github", source: "github", projects: "github" });
	return {
		...loaded,
		resolved: { ...loaded.resolved, ...(areas ? { repo: { labels: { areas } } } : {}) } as LoadedConfig["resolved"],
	};
}

async function run(
	options: Partial<RunUpdateWorkInput> & {
		issues?: ReturnType<typeof issuesFake>;
		source?: ReturnType<typeof sourceFake>;
		declared?: Record<string, string[]> | undefined;
		noAreas?: boolean;
	} = {}
) {
	const { issues = issuesFake(), source = sourceFake(), noAreas, declared, ...rest } = options;
	const lines: string[] = [];
	const { updateIssue, setStatus, startWork } = defaults;
	updateIssue.mockReset().mockImplementation(updateIssueOk());
	setStatus.mockReset().mockResolvedValue({
		status: "ok" as const,
		summary: { ok: 1, fail: 0, skip: 0 },
		key: "#12",
		from: "Planned",
		to: "In Progress",
	});
	startWork.mockReset().mockResolvedValue({ status: "ok" as const, rows: [] });
	const input = {
		issue: "#12",
		loaded: config(noAreas ? null : (declared ?? AREAS)),
		context: { repoRoot: "/r" },
		yes: true,
		loader: fakeLoader({ issues, source }),
		print: (l: string) => void lines.push(stripVTControlCharacters(l)),
		...rest,
	} as RunUpdateWorkInput;
	const report = await runUpdateWork(input);
	return { report, text: lines.join("\n"), issues, source, updateIssue, setStatus, startWork };
}

describe("runUpdateWork area labels", () => {
	it("adds the area labels the changed folders earn to the issue and the pull request", async () => {
		const { report, source, updateIssue, text } = await run();
		expect(source.listPullRequestFiles).toHaveBeenCalledWith(7);
		expect(report.areaLabels).toEqual(["area:cli", "area:docs"]);
		// The issue has area:cli already, so only the missing one goes to it.
		expect(updateIssue).toHaveBeenCalledWith(
			expect.objectContaining({ key: "#12", addLabels: ["area:docs"], yes: true })
		);
		expect(source.updatePullRequest).toHaveBeenCalledWith(7, { labels: ["area:cli", "area:docs"] });
		expect(report.pullRequest).toEqual({ number: 7, url: "https://x/pull/7" });
		expect(text).toContain("area:cli, area:docs");
	});

	it("never removes a label a person added", async () => {
		const { updateIssue, source } = await run({
			source: sourceFake({ listPullRequestFiles: vi.fn(async () => ["cli/a.ts"]) }),
		});
		expect(updateIssue).not.toHaveBeenCalled();
		const patch = source.updatePullRequest.mock.calls[0]![1] as Record<string, unknown>;
		expect(patch).not.toHaveProperty("removeLabels");
	});

	it("is skipped when the repo declares no areas, the provider cannot list files, or there is no pull request", async () => {
		const none = await run({ noAreas: true });
		expect(none.text).toContain("declares no `repo.labels.areas`");
		expect(none.source.listPullRequestFiles).not.toHaveBeenCalled();
		const cannot = await run({ source: sourceFake({ listPullRequestFiles: undefined }) });
		expect(cannot.text).toContain("cannot list a pull request's files");
		const nopr = await run({ source: sourceFake({ listPullRequests: vi.fn(async () => []) }) });
		expect(nopr.text).toContain("no open pull request for #12");
		expect(nopr.report.status).toBe("ok");
	});

	it("says when the changed folders are in no area", async () => {
		const { text } = await run({
			source: sourceFake({ listPullRequestFiles: vi.fn(async () => ["package.json"]) }),
		});
		expect(text).toContain("the changed folders are in no area");
	});

	it("sends every area label when the issue's labels cannot be read", async () => {
		const { updateIssue } = await run({
			issues: issuesFake({
				export: vi.fn(async () => {
					throw new Error("nope");
				}),
			}),
		});
		expect(updateIssue).toHaveBeenCalledWith(expect.objectContaining({ addLabels: ["area:cli", "area:docs"] }));
	});

	it("fails the row, not the run, when the files cannot be read", async () => {
		const { report, text } = await run({
			source: sourceFake({
				listPullRequestFiles: vi.fn(async () => {
					throw new Error("boom");
				}),
			}),
		});
		expect(report.status).toBe("fail");
		expect(text).toContain("could not read the changed files");
	});
});

describe("runUpdateWork fields", () => {
	it("mirrors the title, labels, assignees, milestone and board to the pull request, and the fields to the issue", async () => {
		const { updateIssue, source } = await run({
			title: "fix(cli): better",
			issueTitle: "Better",
			addLabels: ["bug"],
			removeLabels: ["wip"],
			assignees: ["octo"],
			milestone: "v5",
			priority: "high",
			project: "v5",
			areas: ["specs"],
			noAreas: false,
		});
		expect(updateIssue).toHaveBeenCalledWith(
			expect.objectContaining({
				title: "Better",
				addLabels: ["bug", "area:specs", "area:docs"],
				removeLabels: ["wip"],
				assignees: ["octo"],
				milestone: "v5",
				priority: "high",
				project: "v5",
			})
		);
		expect(source.updatePullRequest).toHaveBeenCalledWith(7, {
			title: "fix(cli): better",
			labels: ["bug", "area:specs", "area:cli", "area:docs"],
			removeLabels: ["wip"],
			assignees: ["octo"],
			milestone: "v5",
			projects: ["v5"],
		});
	});

	it("reports what the pull request could not take", async () => {
		const source = sourceFake({
			updatePullRequest: vi.fn(async () => ({
				pullRequest: pr(7, "b"),
				created: false,
				draft: true,
				dropped: ["milestone v9"],
			})),
		});
		const { text } = await run({ source, milestone: "v9" });
		expect(text).toContain("milestone v9");
	});

	it("fails a pull request update the provider cannot do or that throws", async () => {
		const cannot = await run({ source: sourceFake({ updatePullRequest: undefined }), title: "x: y" });
		expect(cannot.report.status).toBe("fail");
		const throws = await run({
			source: sourceFake({
				updatePullRequest: vi.fn(async () => {
					throw new Error("422");
				}),
			}),
			title: "x: y",
		});
		expect(throws.text).toContain("could not update the pull request");
	});

	it("uses --pr, and warns when several pull requests match", async () => {
		const byNumber = await run({ pullRequest: 50, title: "x: y" });
		expect(byNumber.source.getPullRequest).toHaveBeenCalledWith(50);
		expect(byNumber.source.updatePullRequest).toHaveBeenCalledWith(50, expect.objectContaining({ title: "x: y" }));
		const many = await run({
			source: sourceFake({ listPullRequests: vi.fn(async () => [pr(9, "feat/12-b"), pr(7, "feat/12-a")]) }),
		});
		expect(many.text).toContain("2 open pull requests match #12; using #9");
	});

	it("fails --title when there is no pull request", async () => {
		const { report, text } = await run({
			title: "x: y",
			source: sourceFake({ listPullRequests: vi.fn(async () => []) }),
		});
		expect(report.status).toBe("fail");
		expect(text).toContain("--title needs one");
	});

	it("fails when the pull request cannot be found", async () => {
		const { report, text } = await run({
			source: sourceFake({
				listPullRequests: vi.fn(async () => {
					throw new Error("down");
				}),
			}),
		});
		expect(report.status).toBe("fail");
		expect(text).toContain("could not find the pull request: down");
	});

	it("previews with --dry-run and writes nothing to the pull request", async () => {
		const { source, text } = await run({ title: "x: y", context: { repoRoot: "/r", dryRun: true }, yes: false });
		expect(source.updatePullRequest).not.toHaveBeenCalled();
		expect(text).toContain("would update title");
		expect(text).toContain("(dry-run)");
	});

	it("rejects a bad area, an empty title and an empty issue", async () => {
		expect((await run({ areas: ["nope"] })).text).toContain('unknown area "nope"');
		expect((await run({ title: "  " })).text).toContain("--title is empty");
		expect((await run({ issue: " " })).text).toContain("the issue is empty");
	});
});

describe("runUpdateWork --status", () => {
	it("refuses In Review, Blocked and Done without --force, before anything is read or written", async () => {
		for (const status of ["In Review", "Blocked", "Done"]) {
			const { report, text, source, setStatus, updateIssue } = await run({ status, addLabels: ["x"] });
			expect(report.status).toBe("fail");
			expect(text).toContain("--force");
			expect(setStatus).not.toHaveBeenCalled();
			expect(updateIssue).not.toHaveBeenCalled();
			expect(source.listPullRequests).not.toHaveBeenCalled();
		}
	});

	it("sets a status that needs no flag last, and says it is temporary", async () => {
		const { report, setStatus, text, source } = await run({ status: "In Progress", board: "Roadmap" });
		expect(report.status).toBe("ok");
		expect(setStatus).toHaveBeenCalledWith(
			expect.objectContaining({ issue: "#12", status: "In Progress", board: "Roadmap" })
		);
		expect(text).toContain("#12 Planned → In Progress");
		expect(text).toContain("overwrite a hand-set status");
		expect(source.updatePullRequest).toHaveBeenCalled();
		expect(text.indexOf("board status")).toBeGreaterThan(text.indexOf("pull request #7"));
	});

	it("sets a status the automation owns with --force and says the value is temporary", async () => {
		const { setStatus, text } = await run({ status: "In Review", force: true });
		expect(setStatus).toHaveBeenCalled();
		expect(text).toContain("forced: the automation owns this status");
	});

	it("reports a status the board refused, with the command's own words, and a throw", async () => {
		const failing = vi.fn(async (input: { print?: (l: string) => void }) => {
			input.print?.("  not in template roadmap; valid: Planned");
			return { status: "fail" as const, summary: { ok: 0, fail: 1, skip: 0 } };
		});
		const refused = await run({ status: "Nope", setStatus: failing as never });
		expect(refused.report.status).toBe("fail");
		expect(refused.text).toContain("not in template roadmap; valid: Planned");
		const thrown = await run({
			status: "Planned",
			setStatus: vi.fn(async () => {
				throw new Error("no board");
			}),
		});
		expect(thrown.text).toContain("no board");
		const silent = await run({
			status: "Planned",
			setStatus: vi.fn(async () => ({ status: "fail" as const, summary: { ok: 0, fail: 1, skip: 0 } })),
		});
		expect(silent.text).toContain("could not set the status");
	});

	it("previews the status with --dry-run, and rejects an empty one or --force alone", async () => {
		const dry = await run({ status: "Planned", context: { repoRoot: "/r", dryRun: true } });
		expect(dry.text).toContain("would set");
		expect((await run({ status: " " })).text).toContain("--status is empty");
		expect((await run({ force: true })).text).toContain("--force only goes with --status");
	});
});

describe("runUpdateWork --start", () => {
	it("runs start work first with the shared fields, then updates the pull request it made", async () => {
		const startWork = vi.fn(async () => ({
			status: "ok" as const,
			rows: [{ id: "branch", title: "branch", status: "ok" as const, detail: "made", problems: [] }],
		}));
		const { text, source } = await run({
			start: true,
			startWork,
			title: "feat(cli): do it",
			name: "do-it",
			base: "alpha",
			spec: ".notes/x.spec.md",
			onePr: true,
			effort: "low",
			kind: "feature",
			assignees: ["octo"],
			project: "v5",
		});
		expect(startWork).toHaveBeenCalledWith(
			expect.objectContaining({
				issue: "#12",
				yes: true,
				title: "feat(cli): do it",
				name: "do-it",
				base: "alpha",
				spec: ".notes/x.spec.md",
				onePr: true,
				effort: "low",
				kind: "feature",
				assignees: ["octo"],
				project: "v5",
			})
		);
		expect(text).toContain("start: branch");
		expect(source.updatePullRequest).toHaveBeenCalled();
	});

	it("stops when start work fails", async () => {
		const startWork = vi.fn(async () => ({
			status: "fail" as const,
			rows: [{ id: "git", title: "git", status: "fail" as const, detail: "push failed", problems: [] }],
		}));
		const { report, source, text } = await run({ start: true, startWork });
		expect(report.status).toBe("fail");
		expect(text).toContain("start work failed, so nothing after it was run");
		expect(source.listPullRequests).not.toHaveBeenCalled();
	});
});

describe("runUpdateWork asking", () => {
	it("asks once before writing, and cancels on no", async () => {
		const confirm = vi.fn(async (_message: string) => false);
		const { report, source } = await run({ yes: false, interactive: true, confirm });
		expect(report.status).toBe("cancelled");
		expect(confirm).toHaveBeenCalledTimes(1);
		expect(confirm.mock.calls[0]![0]).toContain("area labels from the changed folders");
		expect(source.updatePullRequest).not.toHaveBeenCalled();
	});

	it("goes on when the answer is yes", async () => {
		const { report } = await run({ yes: false, interactive: true, confirm: vi.fn(async () => true) });
		expect(report.status).toBe("ok");
	});

	it("refuses without a terminal and without --yes", async () => {
		await expect(run({ yes: false, interactive: false })).rejects.toBeInstanceOf(NonInteractiveError);
	});
});

describe("runUpdateWork providers", () => {
	it("fails when the config names no issues or source provider", async () => {
		const loaded = loadedWith({ issues: "github" });
		expect((await run({ loaded })).text).toContain("no `source` provider");
		expect((await run({ loaded: loadedWith({ source: "github" }) })).text).toContain("no `issues` provider");
	});

	it("fails naming a provider that did not load", async () => {
		const { report, text } = await run({
			loader: fakeLoader({ issues: issuesFake() }, { source: "missing package" }),
		});
		expect(report.status).toBe("fail");
		expect(text).toContain("`source` provider is not available (missing package)");
	});
});

describe("runUpdateWork defaults and every field", () => {
	it("passes every issue field to update issue, and start work gets the shared loader", async () => {
		const { updateIssue, startWork } = await run({
			start: true,
			kind: "bug",
			priority: "low",
			effort: "high",
			startDate: "2026-11-19",
			targetDate: "2026-12-01",
			parent: "#1",
			blockedBy: ["#2"],
			unblock: ["#3"],
		});
		expect(updateIssue).toHaveBeenCalledWith(
			expect.objectContaining({
				kind: "bug",
				priority: "low",
				effort: "high",
				startDate: "2026-11-19",
				targetDate: "2026-12-01",
				parent: "#1",
				blockedBy: ["#2"],
				unblock: ["#3"],
			})
		);
		expect(startWork).toHaveBeenCalledWith(expect.objectContaining({ loader: expect.anything() }));
	});

	it("fails --pr when the provider cannot read a pull request", async () => {
		const { report, text } = await run({ pullRequest: 5, source: sourceFake({ getPullRequest: undefined }) });
		expect(report.status).toBe("fail");
		expect(text).toContain("cannot read a pull request");
	});

	it("skips the pull request lookup when the provider cannot list them", async () => {
		const { text } = await run({ source: sourceFake({ listPullRequests: undefined }) });
		expect(text).toContain("no open pull request for #12");
	});

	it("asks with the default prompt when a terminal is there", async () => {
		inquirerConfirm.mockResolvedValueOnce(true);
		const { report } = await run({ yes: false, interactive: true });
		expect(report.status).toBe("ok");
		expect(inquirerConfirm).toHaveBeenCalled();
	});

	it("reads whether stdin is a terminal when not told", async () => {
		await expect(run({ yes: false })).rejects.toBeInstanceOf(NonInteractiveError);
	});

	it("names the milestone, board and assignees in the pull request row", async () => {
		const { text } = await run({ milestone: "v5", project: "v5", assignees: ["octo"], removeLabels: ["x"] });
		expect(text).toContain("board v5");
	});

	it("updates the issue with no labels when only another field changed", async () => {
		const { updateIssue } = await run({ noAreas: true, effort: "low" });
		expect(updateIssue.mock.calls[0]![0]).not.toHaveProperty("addLabels");
	});

	it("sends every area label when the issue is not found by export", async () => {
		const { updateIssue } = await run({ issues: issuesFake({ export: vi.fn(async () => []) }) });
		expect(updateIssue).toHaveBeenCalledWith(expect.objectContaining({ addLabels: ["area:cli", "area:docs"] }));
	});

	it("words the status row from what the board reported", async () => {
		const bare = await run({
			status: "Planned",
			setStatus: vi.fn(async () => ({ status: "ok" as const, summary: { ok: 1, fail: 0, skip: 0 } })),
		});
		expect(bare.text).toContain("#12 → Planned");
		const noFrom = await run({
			status: "Planned",
			setStatus: vi.fn(async () => ({
				status: "ok" as const,
				summary: { ok: 1, fail: 0, skip: 0 },
				key: "#12",
				to: "Planned",
			})),
		});
		expect(noFrom.text).toContain("#12 no status → Planned");
	});

	it("fails a provider that is missing with no load failure recorded", async () => {
		const { text } = await run({ loader: fakeLoader({ source: sourceFake() }) });
		expect(text).toContain("`issues` provider is not available");
		expect(text).not.toContain("(");
	});
});
