import { stripVTControlCharacters } from "node:util";

import { describe, expect, it, vi } from "vitest";

const inquirerConfirm = vi.hoisted(() => vi.fn());
vi.mock("@inquirer/prompts", () => ({ confirm: inquirerConfirm }));

import { NonInteractiveError } from "@theholocron/kyber/ui";

import type { ImportResult } from "../../../plugin/index.js";
import { fakeIssues, loadedWith, loaderFor, record } from "../migrate.testing.js";
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

	it("decides whether it can ask from the terminal when told nothing", async () => {
		const { makeLoader } = setup();
		const tty = process.stdin.isTTY;
		Object.defineProperty(process.stdin, "isTTY", { value: false, configurable: true });
		await expect(run({ makeLoader, yes: false })).rejects.toBeInstanceOf(NonInteractiveError);
		Object.defineProperty(process.stdin, "isTTY", { value: tty, configurable: true });
	});
});
