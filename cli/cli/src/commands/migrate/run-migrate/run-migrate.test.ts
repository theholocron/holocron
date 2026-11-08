import { stripVTControlCharacters } from "node:util";

import { describe, expect, it, vi } from "vitest";

const inquirerConfirm = vi.hoisted(() => vi.fn());
vi.mock("@inquirer/prompts", () => ({ confirm: inquirerConfirm }));

import { NonInteractiveError } from "@theholocron/kyber/ui";

import type { ImportResult } from "../../../plugin/index.js";
import { fakeIssues, fakeLoader, loadedWith, loaderFor, record } from "../migrate.testing.js";
import { runMigrate } from "./run-migrate.js";
import type { RunMigrateInput } from "./run-migrate.type.js";

const result = (source: string, key: string, over: Partial<ImportResult> = {}): ImportResult => ({
	source,
	key,
	created: true,
	dropped: [],
	...over,
});

function setup(over: { gh?: Parameters<typeof fakeIssues>[1]; linear?: Parameters<typeof fakeIssues>[1] } = {}) {
	const gh = fakeIssues("github", { export: vi.fn(async () => [record("#1"), record("#2")]), ...over.gh });
	const linear = fakeIssues("linear", {
		import: vi.fn(async () => [
			result("#1", "ENG-1", { dropped: ["assignee (no Linear user with that email)"] }),
			result("#2", "ENG-2"),
		]),
		...over.linear,
	});
	return { gh, linear, makeLoader: loaderFor({ github: { issues: gh }, linear: { issues: linear } }) };
}

async function run(input: Partial<RunMigrateInput> & { makeLoader: RunMigrateInput["makeLoader"] }) {
	const lines: string[] = [];
	const report = await runMigrate({
		loaded: loadedWith(),
		context: { repoRoot: "/x" },
		from: "github",
		to: "linear:team=ENG",
		scope: { kind: "issues", selector: { all: true } },
		yes: true,
		print: (l) => lines.push(stripVTControlCharacters(l)),
		...input,
	});
	return { report, lines };
}

describe("runMigrate", () => {
	it("exports from the source, imports into the target and says what did not carry across", async () => {
		const { gh, linear, makeLoader } = setup();
		const { report, lines } = await run({ makeLoader });
		expect(gh.export).toHaveBeenCalledWith({ all: true });
		expect(linear.import).toHaveBeenCalledWith(
			[expect.objectContaining({ key: "#1" }), expect.objectContaining({ key: "#2" })],
			{ dryRun: false }
		);
		expect(report.status).toBe("ok");
		expect(report.notCarried).toEqual([{ what: "assignee (no Linear user with that email)", count: 1 }]);
		const text = lines.join("\n");
		expect(text).toContain("#1 → ENG-1 (created)");
		expect(text).toContain("github to linear: created 2, skipped 0");
		expect(text).toContain("not carried across:");
		expect(text).toContain("assignee (no Linear user with that email): 1 issue(s)");
	});

	it("marks what an earlier run made as already migrated", async () => {
		const { makeLoader } = setup({
			linear: { import: vi.fn(async () => [result("#1", "ENG-1", { created: false })]) },
		});
		const { lines } = await run({ makeLoader });
		expect(lines.join("\n")).toContain("#1 → ENG-1 (already migrated)");
		expect(lines.join("\n")).toContain("created 0, skipped 1");
	});

	it("on a dry run passes dryRun and writes nothing, and does not ask", async () => {
		const { linear, makeLoader } = setup({
			linear: { import: vi.fn(async () => [result("#1", "", { key: undefined })]) },
		});
		const { report, lines } = await run({ makeLoader, yes: false, context: { repoRoot: "/x", dryRun: true } });
		expect(linear.import).toHaveBeenCalledWith(expect.anything(), { dryRun: true });
		expect(report.status).toBe("ok");
		expect(lines.join("\n")).toContain("#1 → (new) (would create)");
		expect(lines.join("\n")).toContain("dry run, nothing written; would create 1");
		expect(inquirerConfirm).not.toHaveBeenCalled();
	});

	it("names a project scope's board as the target milestone unless one is given", async () => {
		const gh = fakeIssues("github", { export: vi.fn(async () => [record("#1")]) });
		const linear = fakeIssues("linear");
		const projects = {
			key: "projects",
			providerName: "github",
			list: vi.fn(async () => []),
			find: vi.fn(async () => ({ id: "b", name: "v5", url: "u", closed: false })),
			items: vi.fn(async () => [{ key: "#1", title: "a", open: true, blockedBy: [] }]),
		};
		const makeLoader = loaderFor({ github: { issues: gh, projects }, linear: { issues: linear } });
		await run({ makeLoader, scope: { kind: "project", name: "v5", owner: "acme" } });
		expect(linear.import).toHaveBeenCalledWith(expect.anything(), { milestone: "v5", dryRun: false });
		await run({ makeLoader, scope: { kind: "project", name: "v5", owner: "acme" }, milestone: "Q3" });
		expect(linear.import).toHaveBeenLastCalledWith(expect.anything(), { milestone: "Q3", dryRun: false });
	});

	it("asks first, and a no changes nothing", async () => {
		const { linear, makeLoader } = setup();
		const ask = vi.fn(async () => false);
		const { report } = await run({ makeLoader, yes: false, interactive: true, confirm: ask });
		expect(ask).toHaveBeenCalledWith("Create 2 issue(s) on linear from github?");
		expect(report.status).toBe("cancelled");
		expect(linear.import).not.toHaveBeenCalled();
		const yes = await run({ makeLoader, yes: false, interactive: true, confirm: async () => true });
		expect(yes.report.status).toBe("ok");
	});

	it("uses the inquirer prompt by default and refuses without a terminal", async () => {
		const { makeLoader } = setup();
		inquirerConfirm.mockResolvedValueOnce(false);
		expect((await run({ makeLoader, yes: false, interactive: true })).report.status).toBe("cancelled");
		await expect(run({ makeLoader, yes: false, interactive: false })).rejects.toBeInstanceOf(NonInteractiveError);
	});

	it("refuses identical ends, and reports a side that did not load", async () => {
		const { makeLoader } = setup();
		expect((await run({ makeLoader, from: "linear:team=A", to: "linear:team=A" })).report).toMatchObject({
			status: "fail",
		});
		const noSource = await run({ makeLoader: loaderFor({}, { github: { issues: "no token" } }) });
		expect(noSource.report.reason).toMatch(/^source: .*`issues` capability of `github`/);
		const noTarget = await run({ makeLoader: loaderFor({ github: { issues: fakeIssues("github") } }) });
		expect(noTarget.report.reason).toMatch(/^target: /);
	});

	it("skips a target that cannot import and a source that cannot export", async () => {
		const noImport = setup({ linear: { import: undefined } });
		expect((await run({ makeLoader: noImport.makeLoader })).report).toMatchObject({
			status: "skip",
			reason: expect.stringContaining("cannot import"),
		});
		const noExport = setup({ gh: { export: undefined } });
		expect((await run({ makeLoader: noExport.makeLoader })).report).toMatchObject({
			status: "skip",
			reason: expect.stringContaining("cannot export"),
		});
	});

	it("skips when there is nothing to migrate, and fails on a read error", async () => {
		const empty = setup({ gh: { export: vi.fn(async () => []) } });
		expect((await run({ makeLoader: empty.makeLoader })).report).toMatchObject({
			status: "skip",
			reason: "nothing to migrate",
		});
		const broken = setup({ gh: { export: vi.fn(async () => Promise.reject(new Error("boom"))) } });
		expect((await run({ makeLoader: broken.makeLoader })).report.status).toBe("fail");
	});

	it("prints skipped-item notes and fails clearly when the import throws, saying a second run continues", async () => {
		const gh = fakeIssues("github", { export: vi.fn(async () => [record("#1")]) });
		const linear = fakeIssues("linear", { import: vi.fn(async () => Promise.reject(new Error("API down"))) });
		const projects = {
			key: "projects",
			providerName: "github",
			list: vi.fn(async () => []),
			find: vi.fn(async () => ({ id: "b", name: "v5", url: "u", closed: false })),
			items: vi.fn(async () => [
				{ key: "#1", title: "a", open: true, blockedBy: [] },
				{ key: "o/x#2", title: "b", open: true, blockedBy: [] },
			]),
		};
		const { report, lines } = await run({
			makeLoader: loaderFor({ github: { issues: gh, projects }, linear: { issues: linear } }),
			scope: { kind: "project", name: "v5", owner: "acme" },
		});
		expect(lines.join("\n")).toContain("1 item(s) from other repositories were skipped");
		expect(report.status).toBe("fail");
		expect(report.reason).toMatch(/API down.*second run continues/);
	});
});

describe("runMigrate defaults", () => {
	it("prints to the console when no print is given", async () => {
		const log = vi.spyOn(console, "log").mockImplementation(() => {});
		const { makeLoader } = setup();
		await runMigrate({
			loaded: loadedWith(),
			context: { repoRoot: "/x" },
			from: "github",
			to: "linear:team=ENG",
			scope: { kind: "issues", selector: { all: true } },
			yes: true,
			makeLoader,
		});
		expect(log).toHaveBeenCalled();
		log.mockRestore();
	});

	it("passes open-only to the export", async () => {
		const { gh, makeLoader } = setup();
		await run({ makeLoader, openOnly: true });
		expect(gh.export).toHaveBeenCalledWith({ all: true, openOnly: true });
	});

	it("says `limited to N of M` in a real run and a dry run, and still lists what did not carry", async () => {
		const exporter = vi.fn(async (_sel: unknown, info?: { matched?: number }) => {
			info!.matched = 7;
			return [record("#1"), record("#2")];
		});
		for (const dryRun of [false, true]) {
			const { gh, makeLoader } = setup({ gh: { export: exporter } });
			const { report, lines } = await run({
				makeLoader,
				limit: 2,
				order: "newest",
				context: { repoRoot: "/x", dryRun },
			});
			expect(gh.export).toHaveBeenCalledWith({ all: true, limit: 2, order: "newest" }, { matched: 7 });
			expect(lines.join("\n")).toContain("limited to 2 of 7 (newest created)");
			expect(report.limited).toBe("limited to 2 of 7 (newest created)");
			expect(lines.join("\n")).toContain("assignee (no Linear user with that email): 1 issue(s)");
		}
	});

	it("leaves the limit line out when there is no limit", async () => {
		const { makeLoader } = setup();
		const { report, lines } = await run({ makeLoader });
		expect(lines.join("\n")).not.toContain("limited to");
		expect(report).not.toHaveProperty("limited");
	});

	it("decides whether it can ask from the terminal when told nothing", async () => {
		const { makeLoader } = setup();
		const tty = process.stdin.isTTY;
		Object.defineProperty(process.stdin, "isTTY", { value: false, configurable: true });
		await expect(run({ makeLoader, yes: false })).rejects.toBeInstanceOf(NonInteractiveError);
		Object.defineProperty(process.stdin, "isTTY", { value: tty, configurable: true });
	});
});

describe("runMigrate onto a board", () => {
	const board = { id: "B", number: 5, name: "v5", url: "https://x/5", closed: false };
	const none = { listFiles: async () => [], readFile: async () => "" };

	const repoOf = (resolved: RunMigrateInput["loaded"]["resolved"]) => {
		const entry = resolved.providers.issues;
		return entry?.cardinality === "single" ? entry.tuple.options.repo : undefined;
	};

	function boardSetup(over: { addItems?: unknown; find?: unknown; targetBoards?: boolean } = {}) {
		const gh = fakeIssues("github", {
			export: vi.fn(async () => [
				record("#1", { status: "In Progress", statusCategory: "in-progress", priority: "high" }),
				record("#2"),
			]),
		});
		const sourceBoards = {
			key: "projects",
			providerName: "github",
			list: vi.fn(async () => []),
			find: vi.fn(async () => board),
			items: vi.fn(async () => [{ key: "#1", title: "a", open: true, blockedBy: [] }]),
		};
		const target = fakeIssues("github", {
			import: vi.fn(async () => [result("#1", "#11"), result("#2", "#12", { created: false })]),
		});
		const targetBoards = {
			key: "projects",
			providerName: "github",
			list: vi.fn(async () => []),
			find: (over.find ?? vi.fn(async () => undefined)) as never,
			create: vi.fn(async () => board),
			addItems:
				over.addItems ??
				vi.fn(async () => [
					{ key: "#11", added: true, dropped: ["priority high (no matching option on the board)"] },
					{ key: "#12", added: false, dropped: [] },
				]),
		};
		const makeLoader = (resolved: RunMigrateInput["loaded"]["resolved"]) =>
			fakeLoader(
				repoOf(resolved) === "acme/target"
					? { issues: target, ...(over.targetBoards === false ? {} : { projects: targetBoards }) }
					: { issues: gh, projects: sourceBoards }
			);
		return { gh, target, targetBoards, makeLoader: makeLoader as unknown as RunMigrateInput["makeLoader"] };
	}

	const base = {
		from: "github:repo=acme/source",
		to: "github:repo=acme/target",
		scope: { kind: "project", name: "v5", owner: "acme" } as const,
		templatesIo: none,
	};

	it("finds or makes the board, adds each issue with its status and priority, and counts what the board dropped", async () => {
		const { target, targetBoards, makeLoader } = boardSetup();
		const { report, lines } = await run({ ...base, makeLoader });
		expect(target.import).toHaveBeenCalledWith(expect.anything(), { dryRun: false });
		expect(targetBoards.create).toHaveBeenCalledWith("acme", "v5", expect.objectContaining({ name: "roadmap" }));
		expect(targetBoards.addItems).toHaveBeenCalledWith(
			"acme",
			board,
			[
				{ key: "#11", status: "In Progress", category: "active", priority: "high" },
				{ key: "#12", category: "planned" },
			],
			expect.objectContaining({ name: "roadmap" })
		);
		expect(report.status).toBe("ok");
		expect(report.board).toMatchObject({ created: true });
		expect(report.notCarried).toEqual([{ what: "priority high (no matching option on the board)", count: 1 }]);
		const text = lines.join("\n");
		expect(text).toContain('board "v5": created, added 1, already there 1 (https://x/5)');
		expect(text).toContain("priority high (no matching option on the board): 1 issue(s)");
	});

	it("uses the template named, and still sets the milestone when one is given", async () => {
		const { target, targetBoards, makeLoader } = boardSetup({ find: vi.fn(async () => board) });
		await run({ ...base, makeLoader, template: "sprint", milestone: "Q3" });
		expect(target.import).toHaveBeenCalledWith(expect.anything(), { milestone: "Q3", dryRun: false });
		expect(targetBoards.create).not.toHaveBeenCalled();
		expect(targetBoards.addItems).toHaveBeenCalledWith(
			"acme",
			board,
			expect.anything(),
			expect.objectContaining({ name: "sprint" })
		);
	});

	it("on a dry run reads the board and adds nothing", async () => {
		const { targetBoards, makeLoader } = boardSetup();
		const { report, lines } = await run({
			...base,
			makeLoader,
			yes: false,
			context: { repoRoot: "/x", dryRun: true },
		});
		expect(report.board).toEqual({ board: undefined, created: true, items: [] });
		expect(targetBoards.create).not.toHaveBeenCalled();
		expect(targetBoards.addItems).not.toHaveBeenCalled();
		expect(lines.join("\n")).toContain('board "v5": would create from template roadmap');
	});

	it("fails before anything is written when the template does not exist", async () => {
		const { target, makeLoader } = boardSetup();
		const { report } = await run({ ...base, makeLoader, template: "nope" });
		expect(report).toMatchObject({ status: "fail", reason: expect.stringContaining('no board template "nope"') });
		expect(target.import).not.toHaveBeenCalled();
	});

	it("fails with the reason when the board cannot be placed, saying a second run continues", async () => {
		const { makeLoader } = boardSetup({ addItems: vi.fn(async () => Promise.reject(new Error("graphql down"))) });
		const { report } = await run({ ...base, makeLoader });
		expect(report.status).toBe("fail");
		expect(report.reason).toMatch(/graphql down.*second run continues/);
	});

	it("keeps the milestone behaviour when the target has no projects provider, or one that cannot add items", async () => {
		const noBoards = boardSetup({ targetBoards: false });
		const first = await run({ ...base, makeLoader: noBoards.makeLoader });
		expect(first.report.board).toBeUndefined();
		expect(noBoards.target.import).toHaveBeenCalledWith(expect.anything(), { milestone: "v5", dryRun: false });

		const cannotAdd = boardSetup();
		const makeLoader = (resolved: RunMigrateInput["loaded"]["resolved"]) =>
			fakeLoader(
				repoOf(resolved) === "acme/target"
					? { issues: cannotAdd.target, projects: { ...cannotAdd.targetBoards, addItems: undefined } }
					: {
							issues: cannotAdd.gh,
							projects: {
								key: "projects",
								list: async () => [],
								find: async () => board,
								items: async () => [{ key: "#1", title: "a", open: true, blockedBy: [] }],
							},
						}
			);
		await run({ ...base, makeLoader: makeLoader as unknown as RunMigrateInput["makeLoader"] });
		expect(cannotAdd.target.import).toHaveBeenCalledWith(expect.anything(), { milestone: "v5", dryRun: false });
	});
});
