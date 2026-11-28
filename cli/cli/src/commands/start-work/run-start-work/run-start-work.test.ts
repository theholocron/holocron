import { stripVTControlCharacters } from "node:util";

import { describe, expect, it, vi } from "vitest";

const inquirerConfirm = vi.hoisted(() => vi.fn());
vi.mock("@inquirer/prompts", () => ({ confirm: inquirerConfirm }));

import { NonInteractiveError } from "@theholocron/kyber/ui";

import { fakeLoader, loadedWith } from "../../migrate/migrate.testing.js";
import { board, fakeProjects, memoryIo } from "../../project/testing/fake-projects.js";
import { runStartWork } from "./run-start-work.js";
import type { RunStartWorkInput, StartWorkIo } from "./run-start-work.type.js";

const BRANCH = "feat/12-do-the-thing";

/** A fake of the repo: what git answers per command, every call recorded, and a file system of one map. */
function fakeIo(
	over: {
		branchExists?: boolean;
		ahead?: number | "";
		worktrees?: string;
		head?: string;
		fail?: string;
		files?: Record<string, string>;
	} = {}
) {
	const calls: string[] = [];
	const files = new Map(Object.entries(over.files ?? {}));
	const io: StartWorkIo = {
		git: (args, cwd) => {
			const line = args.join(" ");
			calls.push(`${cwd}: ${line}`);
			if (over.fail && line.startsWith(over.fail)) throw new Error(`git ${over.fail} failed`);
			if (line.startsWith("rev-parse --verify")) {
				if (over.branchExists) return "abc";
				throw new Error("not found");
			}
			if (line.startsWith("rev-list --count")) return String(over.ahead ?? 0);
			if (line === "worktree list --porcelain") return over.worktrees ?? "worktree /r\nbranch refs/heads/alpha";
			if (line === "rev-parse --abbrev-ref HEAD") return over.head ?? "alpha";
			if (line === "rev-parse --short HEAD") return "1a2b3c4";
			return "";
		},
		exists: (p) => files.has(p),
		read: (p) => files.get(p) ?? "",
		write: (p, t) => void files.set(p, t),
		today: () => "2026-11-19",
	};
	return { io, calls, files };
}

const issuesFake = (over: Record<string, unknown> = {}) => ({
	providerName: "github",
	get: vi.fn(async () => ({
		key: "#12",
		id: "1",
		summary: "feat(cli): Do the thing",
		status: "open",
		statusCategory: "open",
		assignee: null,
		updated: "",
		url: "https://x/12",
	})),
	update: vi.fn(async () => ({ key: "#12", changed: ["startDate: 2026-11-19"] })),
	export: vi.fn(async () => [
		{
			key: "#12",
			labels: ["enhancement", "cli"],
			milestone: "v5",
			assignee: { id: "1", displayName: "x", login: "octo" },
		},
	]),
	...over,
});
const sourceFake = (over: Record<string, unknown> = {}) => ({
	providerName: "github",
	createPullRequest: vi.fn(async () => ({
		pullRequest: { number: 99, url: "https://x/pull/99", title: "", state: "open", merged: false, branch: BRANCH },
		created: true,
		draft: true,
		dropped: [] as string[],
	})),
	...over,
});

async function run(
	options: Partial<Omit<RunStartWorkInput, "io">> & {
		io?: ReturnType<typeof fakeIo>;
		issues?: ReturnType<typeof issuesFake>;
		source?: ReturnType<typeof sourceFake>;
		configured?: boolean;
	} = {}
) {
	const { io = fakeIo(), issues = issuesFake(), source = sourceFake(), configured = true, ...rest } = options;
	const lines: string[] = [];
	const loaded = loadedWith(configured ? { issues: "github", source: "github" } : {});
	const report = await runStartWork({
		issue: "#12",
		loaded,
		context: { repoRoot: "/r" },
		yes: true,
		loader: fakeLoader({ issues, source }),
		io: io.io,
		print: (l) => lines.push(stripVTControlCharacters(l)),
		...rest,
	});
	return { report, text: lines.join("\n"), issues, source, io };
}

describe("runStartWork", () => {
	it("makes the branch and worktree, an empty first commit, pushes and opens a draft pull request", async () => {
		const { report, text, issues, source, io } = await run();
		expect(report).toMatchObject({
			status: "ok",
			branch: BRANCH,
			directory: "/r/.claude/worktrees/do-the-thing",
			title: "feat(cli): Do the thing",
			pullRequest: { number: 99, created: true },
		});
		expect(io.calls).toEqual([
			`/r: rev-parse --verify --quiet refs/heads/${BRANCH}`,
			"/r: fetch origin alpha",
			`/r: worktree add --no-track -b ${BRANCH} /r/.claude/worktrees/do-the-thing origin/alpha`,
			`/r: rev-list --count origin/alpha..${BRANCH}`,
			"/r/.claude/worktrees/do-the-thing: commit -s --allow-empty -m feat(cli): Do the thing -m Refs #12",
			"/r/.claude/worktrees/do-the-thing: rev-parse --short HEAD",
			`/r/.claude/worktrees/do-the-thing: push -u origin ${BRANCH}`,
		]);
		expect(issues.update).toHaveBeenCalledWith("#12", { startDate: "2026-11-19" });
		expect(source.createPullRequest).toHaveBeenCalledWith({
			title: "feat(cli): Do the thing",
			head: BRANCH,
			base: "alpha",
			draft: true,
			body: expect.stringContaining("- [ ] Green checks"),
			link: { issue: "#12", keyword: "Closes" },
			labels: ["enhancement", "cli"],
			milestone: "v5",
			assignees: ["octo"],
		});
		expect(text).toContain("a feat to alpha publishes a prerelease");
		expect(text).toContain("the open pull request moves the issue to In Progress");
		expect(text).toContain("#99 (draft) https://x/pull/99");
	});

	it("sets Effort with the start date and puts the pull request on a board", async () => {
		const { issues, source } = await run({
			effort: "low",
			project: "v5",
			assignees: ["me"],
			name: "thing",
			title: "fix: it",
		});
		expect(issues.update).toHaveBeenCalledWith("#12", { startDate: "2026-11-19", effort: "low" });
		expect(source.createPullRequest).toHaveBeenCalledWith(
			expect.objectContaining({ title: "fix: it", projects: ["v5"], assignees: ["octo", "me"] })
		);
	});

	it("commits the spec, copied into the worktree, in a docs(specs) pull request that only references the issue", async () => {
		const spec = "---\nstatus: draft\n---\n# S";
		const io = fakeIo({ files: { "/r/.notes/a.spec.md": spec } });
		const { report, source } = await run({ io, spec: ".notes/a.spec.md" });
		expect(report.title).toBe("docs(specs): Do the thing");
		expect(report.branch).toBe("docs/12-do-the-thing");
		expect(io.files.get("/r/.claude/worktrees/do-the-thing/.notes/a.spec.md")).toBe(spec);
		const dir = "/r/.claude/worktrees/do-the-thing";
		expect(io.calls).toContain(`${dir}: add -- .notes/a.spec.md`);
		expect(io.calls).toContain(`${dir}: commit -s -m docs(specs): add the spec for Do the thing -m Refs #12`);
		expect(source.createPullRequest).toHaveBeenCalledWith(
			expect.objectContaining({
				link: { issue: "#12", keyword: "Refs" },
				body: expect.stringContaining("Spec: `.notes/a.spec.md`"),
			})
		);
	});

	it("with --one-pr keeps the code's title and closes the issue, with the spec still the first commit", async () => {
		const io = fakeIo({ files: { "/r/s.md": "status: accepted" } });
		const { report, text, source } = await run({ io, spec: "s.md", onePr: true });
		expect(report.title).toBe("feat(cli): Do the thing");
		expect(source.createPullRequest).toHaveBeenCalledWith(
			expect.objectContaining({ link: { issue: "#12", keyword: "Closes" } })
		);
		expect(text).toContain("the spec's status is accepted, not draft");
	});

	it("refuses --one-pr without a spec, a missing spec and a spec outside the repository", async () => {
		expect((await run({ onePr: true })).text).toContain("--one-pr needs --spec");
		expect((await run({ spec: "nope.md" })).text).toContain("nope.md does not exist");
		expect((await run({ spec: "../x.md" })).text).toContain("outside the repository");
	});

	it("only makes the branch and switches to it with --no-worktree, and commits in the repo", async () => {
		const { report, io } = await run({ worktree: false });
		expect(report.directory).toBe("/r");
		expect(io.calls).toContain(`/r: switch --no-track -c ${BRANCH} origin/alpha`);
		expect(io.calls.some((c) => c.includes("worktree add"))).toBe(false);
		expect(io.calls).toContain(`/r: push -u origin ${BRANCH}`);
	});

	it("places the worktree where --worktree-path says, relative or absolute", async () => {
		expect((await run({ worktreePath: "wt/x" })).report.directory).toBe("/r/wt/x");
		expect((await run({ worktreePath: "/elsewhere/x" })).report.directory).toBe("/elsewhere/x");
	});

	it("starts from --base and the config's default branch", async () => {
		const a = await run({ base: "main" });
		expect(a.io.calls).toContain("/r: fetch origin main");
		expect(a.text).not.toContain("publishes a prerelease");
		expect(a.source.createPullRequest).toHaveBeenCalledWith(expect.objectContaining({ base: "main" }));
	});

	it("is a second run that carries on: reuses the branch and its worktree, makes no commit, leaves the start date", async () => {
		const io = fakeIo({
			branchExists: true,
			ahead: 1,
			worktrees: `worktree /r\nbranch refs/heads/alpha\n\nworktree /w\nbranch refs/heads/${BRANCH}`,
		});
		const { report, text, issues, source } = await run({ io });
		expect(report.directory).toBe("/w");
		expect(issues.update).not.toHaveBeenCalled();
		expect(io.calls.some((c) => c.includes("commit"))).toBe(false);
		expect(text).toContain("already exists; reused");
		expect(text).toContain("already has 1 commit");
		expect(source.createPullRequest).toHaveBeenCalled();
	});

	it("reports an already open pull request and what the provider dropped", async () => {
		const source = sourceFake({
			createPullRequest: vi.fn(async () => ({
				pullRequest: { number: 5, url: "u", title: "", state: "open", merged: false, branch: BRANCH },
				created: false,
				draft: false,
				dropped: ["milestone v5"],
			})),
		});
		const { text, report } = await run({ source });
		expect(text).toContain("already open: #5 u");
		expect(text).toContain("milestone v5");
		expect(report.pullRequest?.created).toBe(false);
	});

	it("carries on at the commit when a branch exists with nothing on it, switching to it without a worktree", async () => {
		const io = fakeIo({ branchExists: true, ahead: 0, head: "alpha" });
		const { io: used } = await run({ io, worktree: false });
		expect(used.calls).toContain(`/r: switch ${BRANCH}`);
		expect(used.calls.some((c) => c.includes("commit -s --allow-empty"))).toBe(true);
	});

	it("adds a worktree for an existing branch that has none", async () => {
		const io = fakeIo({ branchExists: true, ahead: 2 });
		const { report } = await run({ io });
		expect(io.calls).toContain(`/r: worktree add /r/.claude/worktrees/do-the-thing ${BRANCH}`);
		expect(report.directory).toBe("/r/.claude/worktrees/do-the-thing");
	});

	it("stops at the first git failure, deletes nothing and says how to carry on", async () => {
		const io = fakeIo({ fail: "push" });
		const { report, text, source } = await run({ io });
		expect(report.status).toBe("fail");
		expect(text).toContain("nothing was deleted, run the command again");
		expect(source.createPullRequest).not.toHaveBeenCalled();
	});

	it("keeps going when the tracker refuses the start date, and lists what it dropped", async () => {
		const issues = issuesFake({
			update: vi.fn(async () => ({ key: "#12", changed: [], dropped: ["startDate (Linear has no start date)"] })),
		});
		const a = await run({ issues });
		expect(a.report.status).toBe("ok");
		expect(a.text).toContain("startDate (Linear has no start date)");
		expect(a.text).toContain("already as asked");
		const b = await run({ issues: issuesFake({ update: vi.fn(async () => Promise.reject(new Error("boom"))) }) });
		expect(b.report.status).toBe("fail");
		expect(b.source.createPullRequest).toHaveBeenCalled();
		const c = await run({ issues: issuesFake({ update: undefined }) });
		expect(c.text).toContain("cannot update an issue");
	});

	it("fails the row, not the run's other steps, when the pull request cannot be opened", async () => {
		const source = sourceFake({ createPullRequest: vi.fn(async () => Promise.reject(new Error("422"))) });
		const { report, text } = await run({ source });
		expect(report.status).toBe("fail");
		expect(text).toContain("could not open the pull request");
		expect(text).toContain("run the command again to open it");
	});

	it("stops after the push with --no-pr, and needs no source provider", async () => {
		const { report, source, text } = await run({ noPr: true });
		expect(source.createPullRequest).not.toHaveBeenCalled();
		expect(report.status).toBe("ok");
		expect(text).not.toContain("pull request #");
	});

	it("previews with --dry-run: no fetch, no branch, no tracker write, no pull request", async () => {
		const { report, text, issues, source, io } = await run({
			context: { repoRoot: "/r", dryRun: true },
			yes: false,
		});
		expect(report.status).toBe("ok");
		expect(io.calls).toEqual([`/r: rev-parse --verify --quiet refs/heads/${BRANCH}`]);
		expect(issues.update).not.toHaveBeenCalled();
		expect(source.createPullRequest).not.toHaveBeenCalled();
		expect(text).toContain(`would make ${BRANCH} from origin/alpha`);
		expect(text).toContain("would open a draft pull request against alpha, Closes #12");
		expect(text).toContain("(dry-run)");
	});

	it("asks first, and does nothing when the answer is no", async () => {
		const confirm = vi.fn(async (_message: string) => false);
		const { report, source, io } = await run({ yes: false, interactive: true, confirm });
		expect(report.status).toBe("cancelled");
		expect(confirm.mock.calls[0]![0]).toContain(`branch ${BRANCH}`);
		expect(source.createPullRequest).not.toHaveBeenCalled();
		expect(io.calls.some((c) => c.includes("fetch"))).toBe(false);
	});

	it("goes ahead on a yes, using the inquirer prompt by default", async () => {
		inquirerConfirm.mockResolvedValueOnce(true);
		const { report } = await run({ yes: false, interactive: true });
		expect(inquirerConfirm).toHaveBeenCalled();
		expect(report.status).toBe("ok");
	});

	it("refuses to run without a terminal and without --yes", async () => {
		await expect(run({ yes: false, interactive: false })).rejects.toBeInstanceOf(NonInteractiveError);
	});

	it("fails clearly for an empty issue, a missing provider, a bad name, a title that is too long and a key with no number", async () => {
		expect((await run({ issue: " " })).text).toContain("the issue is empty");
		expect((await run({ base: " " })).text).toContain("--base is empty");
		expect((await run({ configured: false })).text).toContain("no `issues` provider");
		expect((await run({ name: "Bad Name" })).text).toContain("must be kebab-case");
		expect((await run({ title: `feat: ${"x".repeat(100)}` })).text).toContain("is over 100 characters");
		expect((await run({ issue: "soon" })).text).toContain("has no number to name a branch with");
		const noTitle = issuesFake({ get: vi.fn(async () => ({ summary: "✨", status: "open" })) });
		expect((await run({ issues: noTitle })).text).toContain("no name can be made");
	});

	it("fails when the issue cannot be read, or the source cannot open a pull request, or a provider is missing", async () => {
		const unreadable = issuesFake({ get: vi.fn(async () => Promise.reject(new Error("404"))) });
		expect((await run({ issues: unreadable })).text).toContain("could not read the issue");
		const noPr = sourceFake({ createPullRequest: undefined });
		expect((await run({ source: noPr })).text).toContain("cannot open a pull request");
		const loaded = loadedWith({ issues: "github" });
		const missing = await runStartWork({
			issue: "#1",
			loaded,
			context: { repoRoot: "/r" },
			yes: true,
			io: fakeIo().io,
			print: () => {},
		});
		expect(missing.status).toBe("fail");
		const loader = fakeLoader({ issues: issuesFake() }, { source: "no such package" });
		const failed = await runStartWork({
			issue: "#1",
			loaded: loadedWith({ issues: "github", source: "github" }),
			context: { repoRoot: "/r" },
			yes: true,
			loader,
			io: fakeIo().io,
			print: () => {},
		});
		expect(failed.rows[0]!.detail).toContain("no such package");
	});

	it("reads the issue without export when the provider has none, falling back to the title's type", async () => {
		const issues = issuesFake({ export: undefined });
		const { source } = await run({ issues });
		expect(source.createPullRequest).toHaveBeenCalledWith(
			expect.not.objectContaining({ labels: expect.anything() })
		);
	});

	it("covers the preview of every variant: effort, an existing branch, a spec, no worktree and no pull request", async () => {
		const io = fakeIo({ branchExists: true, files: { "/r/s.md": "x" } });
		const { text, report } = await run({
			context: { repoRoot: "/r", dryRun: true },
			io,
			effort: "high",
			kind: "task",
			spec: "/r/s.md",
			worktree: false,
			noPr: true,
		});
		expect(report.branch).toBe("docs/12-do-the-thing");
		expect(text).toContain("and Effort high (not again: the branch exists)");
		expect(text).toContain("would reuse docs/12-do-the-thing");
		const confirm = vi.fn(async (_message: string) => false);
		await run({ yes: false, interactive: true, confirm, worktree: false, noPr: true });
		expect(confirm.mock.calls[0]![0]).toContain("no worktree; first commit: empty; no pull request");
		await run({ yes: false, interactive: true, confirm, worktreePath: "/r" });
		expect(confirm.mock.calls[1]![0]).toContain("worktree /r;");
		expect(text).not.toContain("would use");
		expect(text).not.toContain("would open a draft");
		expect(text).toContain("would commit s.md");
	});

	it("commits a spec in the repo itself with no copy when there is no worktree, and reads an empty count as none", async () => {
		const io = fakeIo({ ahead: "", files: { "/r/s.md": "status: draft" } });
		const { report } = await run({ io, spec: "s.md", worktree: false });
		expect(report.status).toBe("ok");
		expect(io.files.size).toBe(1);
		expect(io.calls).toContain("/r: add -- s.md");
	});

	it("names a provider that is not loaded and has no failure recorded, and omits a missing issue address", async () => {
		const loader = fakeLoader({ issues: issuesFake() });
		const missing = await runStartWork({
			issue: "#1",
			loaded: loadedWith({ issues: "github", source: "github" }),
			context: { repoRoot: "/r" },
			yes: true,
			loader,
			io: fakeIo().io,
			print: () => {},
		});
		expect(missing.rows[0]!.detail).toBe("the `source` provider is not available");
		const noUrl = issuesFake({
			get: vi.fn(async () => ({ summary: "Do it", status: "open", assignee: null })),
		});
		const { source } = await run({ issues: noUrl });
		expect(source.createPullRequest).toHaveBeenCalledWith(
			expect.objectContaining({ body: expect.stringContaining("Issue: #12 Do it") })
		);
	});

	it("asks the terminal by default, which is not one under test", async () => {
		await expect(run({ yes: false })).rejects.toBeInstanceOf(NonInteractiveError);
	});
});

describe("runStartWork mirrors the issue onto the pull request", () => {
	const withBoards = (projects: ReturnType<typeof fakeProjects>, over: Record<string, unknown> = {}) => {
		const issues = issuesFake(over);
		const source = sourceFake();
		return {
			issues,
			source,
			loaded: loadedWith({
				issues: "github",
				source: "github",
				projects: ["github", { boards: [{ template: "roadmap", name: "v5" }] }],
			}),
			loader: fakeLoader({ issues, source, projects }),
			templatesIo: memoryIo(),
		};
	};

	it("names a bare number the way GitHub links it, in the commit and the pull request", async () => {
		const { io, source } = await run({ issue: "12" });
		expect(io.calls).toContain(
			"/r/.claude/worktrees/do-the-thing: commit -s --allow-empty -m feat(cli): Do the thing -m Refs #12"
		);
		expect(source.createPullRequest).toHaveBeenCalledWith(
			expect.objectContaining({
				body: expect.stringContaining("Issue: [#12](https://x/12) feat(cli): Do the thing"),
			})
		);
	});

	it("keeps a tracker's own key in the trailer", async () => {
		const { io } = await run({ issue: "ENG-42", name: "thing", title: "fix: it" });
		expect(io.calls.some((c) => c.endsWith("-m fix: it -m Refs ENG-42"))).toBe(true);
	});

	it("assigns the pull request to a GitHub issue's assignee, whose id is the login", async () => {
		const { source } = await run({
			issues: issuesFake({
				export: vi.fn(async () => [
					{ key: "#12", labels: [], assignee: { id: "iamnewton", displayName: "Newton" } },
				]),
			}),
		});
		expect(source.createPullRequest).toHaveBeenCalledWith(expect.objectContaining({ assignees: ["iamnewton"] }));
	});

	it("falls back to the issue's own assignee when the export fails", async () => {
		const { source } = await run({
			issues: issuesFake({
				export: vi.fn(async () => {
					throw new Error("no export");
				}),
				get: vi.fn(async () => ({
					key: "#12",
					summary: "feat(cli): Do the thing",
					status: "open",
					assignee: { id: "iamnewton", displayName: "Newton" },
				})),
			}),
		});
		expect(source.createPullRequest).toHaveBeenCalledWith(expect.objectContaining({ assignees: ["iamnewton"] }));
	});

	it("puts the pull request on the boards the issue is on, with --project", async () => {
		const projects = fakeProjects({
			find: vi.fn(async (_o, name) => board(name)),
			items: vi.fn(async () => [{ key: "#12", title: "x", open: true, blockedBy: [] }]),
		});
		const set = withBoards(projects);
		const { source, text } = await run(set);
		expect(source.createPullRequest).toHaveBeenCalledWith(expect.objectContaining({ projects: ["v5"] }));
		expect(text).not.toContain("boards");
		const again = withBoards(projects);
		await run({ ...again, project: "v5" });
		expect(again.source.createPullRequest).toHaveBeenCalledWith(expect.objectContaining({ projects: ["v5"] }));
	});

	it("reads the board templates from the real file system when no io is given", async () => {
		const projects = fakeProjects({
			find: vi.fn(async (_o, name) => board(name)),
			items: vi.fn(async () => [{ key: "#12", title: "x", open: true, blockedBy: [] }]),
		});
		const { templatesIo: _unused, ...set } = withBoards(projects);
		const { source } = await run(set);
		expect(source.createPullRequest).toHaveBeenCalledWith(expect.objectContaining({ projects: ["v5"] }));
	});

	it("shows a board it cannot read as a row and still opens the pull request", async () => {
		const projects = fakeProjects({
			find: vi.fn(async () => {
				throw new Error("token refused");
			}),
			items: vi.fn(async () => []),
		});
		const set = withBoards(projects);
		const { report, source, text } = await run(set);
		expect(report.status).toBe("ok");
		expect(text).toContain("board v5: token refused");
		expect(source.createPullRequest).toHaveBeenCalledWith(
			expect.not.objectContaining({ projects: expect.anything() })
		);
	});
});
