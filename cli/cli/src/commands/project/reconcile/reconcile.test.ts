import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { fakeLogger } from "@theholocron/observability/testing";
import { describe, expect, it, vi } from "vitest";

import { type LoadedConfig, resolveConfig } from "../../../config/index.js";
import type { BoardItem, BoardSummary, Projects } from "../../../plugin/index.js";
import { type PluginImporter, PluginLoader } from "../../../plugin/index.js";
import { runProjectReconcile } from "./reconcile.js";

const BOARD: BoardSummary = { id: "B1", number: 5, name: "v5", url: "https://example.test/5", closed: false };

const item = (over: Partial<BoardItem> & { key: string }): BoardItem => ({
	title: `title ${over.key}`,
	open: true,
	blockedBy: [],
	...over,
});

const ITEMS: BoardItem[] = [
	item({ key: "#1", status: "Todo", blockedBy: ["#9"] }),
	item({ key: "#2", status: "Blocked" }),
	item({ key: "#3", status: "Todo", open: false }),
	item({ key: "#4" }),
	item({ key: "#5", status: "Todo" }),
];

function fakeProjects(over: Partial<Projects> = {}): Projects {
	return {
		key: "projects",
		providerName: "github",
		list: async () => [BOARD],
		find: vi.fn(async () => BOARD),
		create: async () => BOARD,
		close: async () => {},
		read: async () => ({ board: BOARD, statuses: [], fields: [], views: [], rules: [] }),
		items: vi.fn(async () => ITEMS),
		setStatus: vi.fn(async (_o: string, _b: BoardSummary, _k: string, status: string) => ({
			transitioned: true,
			status,
		})),
		...over,
	} as Projects;
}

function setup(
	projects: Projects | undefined,
	opts: {
		dryRun?: boolean;
		board?: string;
		options?: Record<string, unknown>;
		files?: Record<string, string>;
		noProvider?: boolean;
		/** Read template files from this real directory instead of the injected fake. */
		diskRoot?: string;
		/** Leave out the injected print, logger, dry-run flag and context org, so the defaults run. */
		bare?: boolean;
		/** The config's own org, for the case where the run context has none. */
		configOrg?: string | null;
	} = {}
) {
	const options = opts.options ?? { boards: [{ template: "roadmap", name: "v5" }] };
	const loaded: LoadedConfig = {
		resolved: resolveConfig({
			name: "demo",
			org: opts.configOrg === null ? undefined : (opts.configOrg ?? "theholocron"),
			providers: opts.noProvider ? {} : { projects: ["github", options] },
		} as Parameters<typeof resolveConfig>[0]),
		filepath: "/tmp/test/holocron.config.json",
	};
	const importer = vi.fn(async (pkg: string) => {
		if (pkg !== "@theholocron/holocron-plugin-github" || !projects) throw new Error(`MODULE_NOT_FOUND: ${pkg}`);
		return {
			createPlugin: () => ({ name: "gh", capabilities: { projects: () => projects } }),
		} as unknown as Awaited<ReturnType<PluginImporter>>;
	});
	const loader = new PluginLoader(loaded.resolved, { repoRoot: "/tmp/test" }, importer as unknown as PluginImporter);
	const lines: string[] = [];
	const files = opts.files ?? {};
	return {
		lines,
		run: () =>
			runProjectReconcile({
				loaded,
				context: opts.bare
					? { repoRoot: opts.diskRoot ?? "/tmp/test" }
					: { repoRoot: opts.diskRoot ?? "/tmp/test", dryRun: opts.dryRun ?? false, org: "theholocron" },
				...(opts.board ? { board: opts.board } : {}),
				loader,
				...(opts.diskRoot
					? {}
					: {
							templatesIo: {
								listFiles: async () => Object.keys(files),
								readFile: async (path: string) => files[path.split("/").pop()!]!,
							},
						}),
				...(opts.bare ? {} : { print: (l: string) => lines.push(l), logger: fakeLogger() }),
			}),
	};
}

describe("runProjectReconcile", () => {
	it("applies each change through setStatus, prints a line per item and reports what it left", async () => {
		const projects = fakeProjects();
		const { run, lines } = setup(projects);
		const report = await run();
		expect(report.status).toBe("ok");
		expect(projects.setStatus).toHaveBeenCalledTimes(3);
		expect(projects.setStatus).toHaveBeenCalledWith("theholocron", BOARD, "#1", "Blocked");
		expect(projects.setStatus).toHaveBeenCalledWith("theholocron", BOARD, "#2", "Todo");
		expect(projects.setStatus).toHaveBeenCalledWith("theholocron", BOARD, "#3", "Done");
		expect(report.boards[0]).toMatchObject({ name: "v5", applied: ["#1", "#2", "#3"], unset: ["#4"] });
		const text = lines.join("\n");
		expect(text).toContain("#1 Todo → Blocked (has an open blocker)");
		expect(text).toContain("#2 Blocked → Todo (no open blocker left)");
		expect(text).toContain("#3 Todo → Done (closed)");
		expect(text).toContain("#4 has no status");
		expect(text).toContain("3 ok, 0 fail, 1 skipped");
	});

	it("passes the template to items()", async () => {
		const projects = fakeProjects();
		await setup(projects).run();
		expect(projects.items).toHaveBeenCalledWith("theholocron", BOARD, expect.objectContaining({ name: "roadmap" }));
	});

	it("prints the plan and calls no mutator on --dry-run", async () => {
		const projects = fakeProjects();
		const { run, lines } = setup(projects, { dryRun: true });
		const report = await run();
		expect(report.status).toBe("dry-run");
		expect(projects.setStatus).not.toHaveBeenCalled();
		expect(lines.join("\n")).toContain("would set #1 Todo → Blocked");
		expect(report.boards[0]!.applied).toEqual([]);
		expect(report.boards[0]!.changes).toHaveLength(3);
	});

	it("reports a thrown refusal, goes on with the rest and fails the run", async () => {
		const projects = fakeProjects({
			setStatus: vi.fn(async (_o: string, _b: BoardSummary, key: string, status: string) => {
				if (key === "#1") throw new Error("transition not allowed");
				return { transitioned: true, status };
			}),
		});
		const { run, lines } = setup(projects);
		const report = await run();
		expect(report.status).toBe("fail");
		expect(report.failures).toEqual([{ step: "#1", message: expect.stringContaining("transition not allowed") }]);
		expect(projects.setStatus).toHaveBeenCalledTimes(3);
		expect(report.boards[0]!.applied).toEqual(["#2", "#3"]);
		expect(lines.join("\n")).toContain("1 fail");
	});

	it("treats a result that is not the wanted status as a refusal", async () => {
		const projects = fakeProjects({
			setStatus: vi.fn(async () => ({ transitioned: false, status: "Todo", via: "workflow refused" })),
		});
		const report = await setup(projects).run();
		expect(report.status).toBe("fail");
		expect(report.failures[0]!.message).toContain("refused: still Todo (workflow refused)");
	});

	it("prints 'already' when the provider says the item was there", async () => {
		const projects = fakeProjects({
			setStatus: vi.fn(async (_o: string, _b: BoardSummary, _k: string, status: string) => ({
				transitioned: false,
				status,
			})),
		});
		const { run, lines } = setup(projects);
		await run();
		expect(lines.join("\n")).toContain("already #1");
	});

	it("says the board is already true when nothing needs a rule", async () => {
		const projects = fakeProjects({ items: vi.fn(async () => [item({ key: "#1", status: "Todo" })]) });
		const { run, lines } = setup(projects);
		const report = await run();
		expect(report.status).toBe("ok");
		expect(lines.join("\n")).toContain("already true");
	});

	it("reports a rule whose category the template lacks", async () => {
		const template = JSON.stringify({
			statuses: [
				{ name: "Todo", category: "planned" },
				{ name: "Done", category: "done" },
			],
			fields: [],
			views: [{ name: "All", layout: "table" }],
		});
		const projects = fakeProjects({
			items: vi.fn(async () => [item({ key: "#1", status: "Todo", blockedBy: ["#9"] })]),
		});
		const { run, lines } = setup(projects, {
			options: { boards: [{ template: "mine", name: "v5" }] },
			files: { "mine.json": template },
		});
		const report = await run();
		expect(projects.setStatus).not.toHaveBeenCalled();
		expect(report.boards[0]!.unresolved).toHaveLength(1);
		expect(lines.join("\n")).toContain("template has no blocked status");
	});

	it("limits the run to the named board and refuses an undeclared one", async () => {
		const projects = fakeProjects();
		const options = {
			boards: [
				{ template: "roadmap", name: "v5" },
				{ template: "sprint", name: "s1" },
			],
		};
		const both = await setup(projects, { options }).run();
		expect(both.boards.map((b) => b.name)).toEqual(["v5", "s1"]);
		const one = await setup(fakeProjects(), { options, board: "s1" }).run();
		expect(one.boards.map((b) => b.name)).toEqual(["s1"]);
		const none = await setup(fakeProjects(), { options, board: "zzz" }).run();
		expect(none.status).toBe("fail");
		expect(none.message).toContain('no declared board is named "zzz"');
	});

	it("fails a board whose template does not exist, and goes on", async () => {
		const options = {
			boards: [
				{ template: "nope", name: "a" },
				{ template: "roadmap", name: "v5" },
			],
		};
		const report = await setup(fakeProjects(), { options }).run();
		expect(report.status).toBe("fail");
		expect(report.failures[0]).toMatchObject({ step: "a" });
		expect(report.boards.map((b) => b.name)).toEqual(["v5"]);
	});

	it("fails a board that cannot be found, and one that cannot be read", async () => {
		const missing = await setup(fakeProjects({ find: vi.fn(async () => undefined) })).run();
		expect(missing.status).toBe("fail");
		expect(missing.failures[0]!.message).toContain("does not exist or is closed");
		const broken = await setup(
			fakeProjects({
				items: vi.fn(async () => {
					throw new Error("boom");
				}),
			})
		).run();
		expect(broken.status).toBe("fail");
		expect(broken.failures[0]!.message).toContain("boom");
	});

	it("skips a provider that cannot list items or set a status", async () => {
		const { run, lines } = setup(fakeProjects({ items: undefined }));
		const report = await run();
		expect(report.status).toBe("ok");
		expect(report.message).toBe("skipped");
		expect(lines.join("\n")).toContain("cannot list items or set a status");
	});

	it("refuses with no provider, no boards or bad options", async () => {
		const none = await setup(undefined, { noProvider: true }).run();
		expect(none.status).toBe("fail");
		expect(none.message).toContain("no `projects` provider");
		const noBoards = await setup(fakeProjects(), { options: {} }).run();
		expect(noBoards.message).toContain("declares no boards");
		const bad = await setup(fakeProjects(), { options: { boards: "x" } }).run();
		expect(bad.message).toContain("providers.projects:");
	});

	it("warns about a template file with a problem and still runs", async () => {
		const { run, lines } = setup(fakeProjects(), { files: { "bad.json": "{not json" } });
		const report = await run();
		expect(report.status).toBe("ok");
		expect(lines.join("\n")).toContain("bad.json: not valid JSON");
	});
	it("reads the repo's own template files from disk when none are injected", async () => {
		const diskRoot = mkdtempSync(join(tmpdir(), "reconcile-"));
		try {
			mkdirSync(join(diskRoot, ".holocron", "projects"), { recursive: true });
			writeFileSync(
				join(diskRoot, ".holocron", "projects", "team.json"),
				JSON.stringify({ extends: "roadmap", fields: [{ name: "Team", type: "text" }] })
			);
			const projects = fakeProjects();
			const { run } = setup(projects, { diskRoot, options: { boards: [{ template: "team", name: "v5" }] } });
			const report = await run();
			expect(report.status).toBe("ok");
			expect(projects.items).toHaveBeenCalledWith(
				"theholocron",
				BOARD,
				expect.objectContaining({ name: "team" })
			);
		} finally {
			rmSync(diskRoot, { recursive: true, force: true });
		}
	});

	it("treats a repo with no template directory as having only the built-ins", async () => {
		const diskRoot = mkdtempSync(join(tmpdir(), "reconcile-"));
		try {
			const { run } = setup(fakeProjects(), { diskRoot });
			expect((await run()).status).toBe("ok");
		} finally {
			rmSync(diskRoot, { recursive: true, force: true });
		}
	});
	it("names an item with no status as coming from `no status` when it is closed", async () => {
		const projects = fakeProjects({ items: vi.fn(async () => [item({ key: "#7", open: false })]) });
		const { run, lines } = setup(projects);
		const report = await run();
		expect(report.status).toBe("ok");
		expect(lines.join("\n")).toContain("#7 no status → Done (closed)");
	});

	it("reports a refusal that comes with no reason as just the status it is still in", async () => {
		const projects = fakeProjects({
			items: vi.fn(async () => [item({ key: "#8", status: "Todo", blockedBy: ["#9"] })]),
			setStatus: vi.fn(async () => ({ transitioned: false, status: "Todo" })),
		});
		const report = await setup(projects).run();
		expect(report.failures).toEqual([{ step: "#8", message: "refused: still Todo" }]);
	});

	it("prints to the console and applies the changes when no print, logger or dry-run flag is given", async () => {
		const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
		try {
			const projects = fakeProjects();
			const report = await setup(projects, { bare: true }).run();
			expect(report.status).toBe("ok");
			expect(projects.setStatus).toHaveBeenCalledTimes(3);
			expect(log).toHaveBeenCalledWith(expect.stringContaining("3 ok, 0 fail, 1 skipped"));
		} finally {
			log.mockRestore();
		}
	});

	it("takes the owner from the config's org when the run context has none", async () => {
		const projects = fakeProjects();
		const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
		try {
			await setup(projects, { bare: true, configOrg: "from-config" }).run();
			expect(projects.find).toHaveBeenCalledWith("from-config", "v5");
		} finally {
			log.mockRestore();
		}
	});

	it("uses an empty owner when neither the run context nor the config names an org", async () => {
		const projects = fakeProjects();
		const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
		try {
			await setup(projects, { bare: true, configOrg: null }).run();
			expect(projects.find).toHaveBeenCalledWith("", "v5");
		} finally {
			log.mockRestore();
		}
	});

	it("says why a provider refused a change when it gives a reason", async () => {
		const projects = fakeProjects({
			items: vi.fn(async () => [item({ key: "#8", status: "Todo", blockedBy: ["#9"] })]),
			setStatus: vi.fn(async () => ({ transitioned: false, status: "Todo", via: "workflow forbids it" })),
		});
		const { run, lines } = setup(projects);
		const report = await run();
		expect(report.status).toBe("fail");
		expect(lines.join("\n")).toContain("refused: still Todo (workflow forbids it)");
	});
});
