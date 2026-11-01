import { describe, expect, it, vi } from "vitest";

import { noopLogger } from "../../utils/index.js";
import { runGroup } from "./group.js";
import type { GroupInput } from "./group.type.js";

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
	const run = (config: GroupInput["config"], namespace: string, opts: Partial<GroupInput> = {}) =>
		runGroup({
			cwd: CWD,
			config,
			namespace,
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

describe("runGroup", () => {
	it("runs every matching task in declaration order, aggregating ok when all succeed", () => {
		const { run, exec } = makeGroup({
			"package.json": PKG,
			"turbo.json": TURBO(["sourceQuality.staticAnalysis", "sourceQuality.formatting"]),
		});
		const report = run(
			{ tasks: ["sourceQuality.staticAnalysis", "sourceQuality.formatting", "verification.unitTests"] },
			"sourceQuality"
		);
		expect(report.status).toBe("ok");
		expect(report.jobs.map((j) => j.task)).toEqual(["sourceQuality.staticAnalysis", "sourceQuality.formatting"]);
		expect(report.jobs.every((j) => j.status === "ok")).toBe(true);
		expect(exec).toHaveBeenCalledTimes(2);
	});

	it("passes a task entry's job switches to the task it runs", () => {
		const { run, exec } = makeGroup(
			{ "package.json": PKG },
			{ lookPath: (_cwd, bin) => (bin === "node" ? "/bin/node" : null) }
		);
		const report = run(
			{ tasks: [{ name: "platform.repoValidation", jobs: { docsEnforcement: false } }] },
			"platform"
		);
		expect(report.status).toBe("ok");
		expect(exec.mock.calls.map((c) => c[1])).toEqual([[process.argv[1], "probe", "specs", "check"]]);
	});

	it("aggregates fail when any matched task fails, but still runs every one of them", () => {
		const exec = vi
			.fn<(c: string, a: string[], o: { cwd: string }) => { exitCode: number }>()
			.mockReturnValueOnce({ exitCode: 1 })
			.mockReturnValueOnce({ exitCode: 0 });
		const { run } = makeGroup(
			{ "package.json": PKG, "turbo.json": TURBO(["sourceQuality.staticAnalysis", "sourceQuality.formatting"]) },
			{ exec }
		);
		const report = run({ tasks: ["sourceQuality.staticAnalysis", "sourceQuality.formatting"] }, "sourceQuality");
		expect(report.status).toBe("fail");
		expect(report.jobs.map((j) => j.status)).toEqual(["fail", "ok"]);
		// both tasks ran despite the first one failing
		expect(exec).toHaveBeenCalledTimes(2);
	});

	it("aggregates dry-run when every matched task is a dry run, without executing anything", () => {
		const { run, exec } = makeGroup({
			"package.json": PKG,
			"turbo.json": TURBO(["sourceQuality.staticAnalysis", "sourceQuality.formatting"]),
		});
		const report = run({ tasks: ["sourceQuality.staticAnalysis", "sourceQuality.formatting"] }, "sourceQuality", {
			dryRun: true,
		});
		expect(report.status).toBe("dry-run");
		expect(exec).not.toHaveBeenCalled();
	});

	it("returns status unknown with no jobs when the namespace matches nothing", () => {
		const { run } = makeGroup({ "package.json": PKG });
		const report = run({ tasks: ["verification.unitTests"] }, "sourceQuality");
		expect(report).toEqual({ status: "unknown", jobs: [] });
	});

	it("forwards --filter to each matched task's turbo invocation", () => {
		const { run, exec } = makeGroup({
			"package.json": PKG,
			"turbo.json": TURBO(["sourceQuality.staticAnalysis"]),
		});
		run({ tasks: ["sourceQuality.staticAnalysis"] }, "sourceQuality", { filter: "@scope/x" });
		expect(exec).toHaveBeenCalledWith("turbo", ["run", "sourceQuality.staticAnalysis", "--filter=@scope/x"], {
			cwd: CWD,
		});
	});

	it("forwards --affected and --base to each matched task's turbo invocation", () => {
		const { run, exec } = makeGroup({
			"package.json": PKG,
			"turbo.json": TURBO(["sourceQuality.staticAnalysis"]),
		});
		run({ tasks: ["sourceQuality.staticAnalysis"] }, "sourceQuality", { affected: true, base: "abc", env: {} });
		expect(exec).toHaveBeenCalledWith("turbo", ["run", "sourceQuality.staticAnalysis", "--affected"], {
			cwd: CWD,
			env: { TURBO_SCM_BASE: "abc" },
		});
	});

	it("prints a header line naming the namespace and matched task count", () => {
		const { run, lines } = makeGroup({
			"package.json": PKG,
			"turbo.json": TURBO(["sourceQuality.staticAnalysis", "sourceQuality.formatting"]),
		});
		run({ tasks: ["sourceQuality.staticAnalysis", "sourceQuality.formatting"] }, "sourceQuality");
		expect(lines[0]).toBe("holocron run sourceQuality — 2 task(s)");
	});
});
