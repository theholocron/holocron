import { describe, expect, it, vi } from "vitest";

import { noopLogger } from "../../utils/index.js";
import { runGroup } from "./group.js";
import type { GroupInput, GroupMember } from "./group.type.js";

const CWD = "/repo";

function makeFs(files: Record<string, string>) {
	const rel = (p: string) => (p === CWD ? "" : p.startsWith(CWD + "/") ? p.slice(CWD.length + 1) : p);
	return {
		readFile: (p: string): string => {
			const c = files[rel(p)];
			if (c === undefined) throw new Error(`ENOENT: ${p}`);
			return c;
		},
		fileExists: (p: string): boolean => files[rel(p)] !== undefined,
		listDir: (p: string): string[] => {
			const r = rel(p);
			const prefix = r === "" ? "" : r + "/";
			return Object.keys(files)
				.filter((f) => f.startsWith(prefix) && !f.slice(prefix.length).includes("/"))
				.map((f) => f.slice(prefix.length));
		},
	};
}

function makeGroup(files: Record<string, string>, overrides: Partial<GroupInput> = {}) {
	const exec = vi.fn((_c: string, _a: string[], _o: { cwd: string }) => ({ exitCode: 0 }));
	const lines: string[] = [];
	const fs = makeFs(files);
	const run = (members: GroupMember[], label: string, opts: Partial<GroupInput> = {}) =>
		runGroup({
			cwd: CWD,
			label,
			members,
			print: (l) => lines.push(l),
			logger: noopLogger,
			exec,
			readFile: fs.readFile,
			fileExists: fs.fileExists,
			listDir: fs.listDir,
			lookPath: () => null,
			...overrides,
			...opts,
		});
	return { run, exec, lines };
}

const PKG = JSON.stringify({ name: "@scope/x" });
const TURBO = (tasks: string[]) => JSON.stringify({ tasks: Object.fromEntries(tasks.map((t) => [t, {}])) });
const members = (...tasks: string[]): GroupMember[] => tasks.map((task) => ({ task }));

describe("runGroup", () => {
	it("runs every member in order, aggregating ok when all succeed", () => {
		const { run, exec } = makeGroup({
			"package.json": PKG,
			"turbo.json": TURBO(["lint:code", "typecheck"]),
		});
		const report = run(members("lint:code", "typecheck"), "lint");
		expect(report.status).toBe("ok");
		expect(report.jobs.map((j) => j.task)).toEqual(["lint:code", "typecheck"]);
		expect(report.jobs.every((j) => j.status === "ok")).toBe(true);
		expect(exec).toHaveBeenCalledTimes(2);
	});

	it("passes a member's job switches and passthrough to the task it runs", () => {
		const { run, exec } = makeGroup(
			{ "package.json": PKG },
			{ lookPath: (_cwd, bin) => (bin === "node" ? "/bin/node" : null) }
		);
		const report = run([{ task: "validate", jobSwitches: { docsEnforcement: false } }], "validate");
		expect(report.status).toBe("ok");
		expect(exec.mock.calls.map((c) => c[1])).toEqual([[process.argv[1], "probe", "specs", "check"]]);
	});

	it("aggregates fail when any member fails, but still runs every one of them", () => {
		const exec = vi
			.fn<(c: string, a: string[], o: { cwd: string }) => { exitCode: number }>()
			.mockReturnValueOnce({ exitCode: 1 })
			.mockReturnValueOnce({ exitCode: 0 });
		const { run } = makeGroup({ "package.json": PKG, "turbo.json": TURBO(["lint:code", "typecheck"]) }, { exec });
		const report = run(members("lint:code", "typecheck"), "lint");
		expect(report.status).toBe("fail");
		expect(report.jobs.map((j) => j.status)).toEqual(["fail", "ok"]);
		// both ran despite the first one failing
		expect(exec).toHaveBeenCalledTimes(2);
	});

	it("aggregates dry-run when every member is a dry run, without executing anything", () => {
		const { run, exec } = makeGroup({
			"package.json": PKG,
			"turbo.json": TURBO(["lint:code", "typecheck"]),
		});
		const report = run(members("lint:code", "typecheck"), "lint", { dryRun: true });
		expect(report.status).toBe("dry-run");
		expect(exec).not.toHaveBeenCalled();
	});

	it("returns status unknown with no jobs when there is nothing to run", () => {
		const { run } = makeGroup({ "package.json": PKG });
		expect(run([], "lint")).toEqual({ status: "unknown", jobs: [] });
	});

	it("reports a member with no local runner as skipped (CI only) and does not fail the run", () => {
		const { run, exec } = makeGroup({ "package.json": PKG });
		const report = run(members("scan:code"), "scan");
		expect(report.status).toBe("ok");
		expect(report.jobs).toEqual([
			{ task: "scan:code", status: "skip", command: undefined, message: "skipped (CI only)" },
		]);
		expect(exec).not.toHaveBeenCalled();
	});

	it("keeps the reason of a skip that is not CI-only", () => {
		const { run } = makeGroup({ "package.json": PKG }, { listDir: () => [] });
		const report = run(members("build"), "x");
		expect(report.jobs[0]).toMatchObject({ status: "skip", message: "no build task for this repo" });
	});

	it("lists the skipped tasks first, each with its reason, and runs the rest", () => {
		const { run, lines } = makeGroup({ "package.json": PKG, "turbo.json": TURBO(["lint:code"]) });
		const report = run(members("lint:code"), "lint", {
			skipped: [{ task: "lint:data", message: "skipped (repo-wide, run from the root)" }],
		});
		expect(report.status).toBe("ok");
		expect(report.jobs).toEqual([
			{ task: "lint:data", status: "skip", message: "skipped (repo-wide, run from the root)" },
			expect.objectContaining({ task: "lint:code", status: "ok" }),
		]);
		expect(lines.join("\n")).toContain("  · skipped (repo-wide, run from the root)");
		expect(lines[0]).toBe("holocron run lint — 2 task(s)");
	});

	it("forwards --filter to each member's turbo invocation", () => {
		const { run, exec } = makeGroup({ "package.json": PKG, "turbo.json": TURBO(["lint:code"]) });
		run(members("lint:code"), "lint", { filter: "@scope/x" });
		expect(exec).toHaveBeenCalledWith("turbo", ["run", "lint:code", "--filter=@scope/x"], { cwd: CWD });
	});

	it("forwards --affected and --base to each member's turbo invocation", () => {
		const { run, exec } = makeGroup({ "package.json": PKG, "turbo.json": TURBO(["lint:code"]) });
		run(members("lint:code"), "lint", { affected: true, base: "abc", env: {} });
		expect(exec).toHaveBeenCalledWith("turbo", ["run", "lint:code", "--affected"], {
			cwd: CWD,
			env: { TURBO_SCM_BASE: "abc" },
		});
	});

	it("forwards a member's passthrough to its tool", () => {
		const { run, exec } = makeGroup({ "package.json": PKG, "turbo.json": TURBO(["lint:code"]) });
		run([{ task: "lint:code", passthrough: ["--fix"] }], "lint");
		expect(exec).toHaveBeenCalledWith("turbo", ["run", "lint:code", "--", "--fix"], { cwd: CWD });
	});

	it("prints a header line naming what was asked for and the task count", () => {
		const { run, lines } = makeGroup({
			"package.json": PKG,
			"turbo.json": TURBO(["lint:code", "typecheck"]),
		});
		run(members("lint:code", "typecheck"), "sourceQuality");
		expect(lines[0]).toBe("holocron run sourceQuality — 2 task(s)");
	});
});
