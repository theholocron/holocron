import { describe, expect, it, vi } from "vitest";

import { noopLogger } from "../../utils/index.js";
import { runWords } from "./run-words.js";
import type { RunWordsInput } from "./run-words.type.js";

const CWD = "/repo";
const PKG = JSON.stringify({ name: "@scope/x" });
const TURBO = (tasks: string[]) => JSON.stringify({ tasks: Object.fromEntries(tasks.map((t) => [t, {}])) });

function setup(files: Record<string, string>, overrides: Partial<RunWordsInput> = {}) {
	const exec = vi.fn((_c: string, _a: string[], _o: { cwd: string }) => ({ exitCode: 0 }));
	const lines: string[] = [];
	const warnings: string[] = [];
	const rel = (p: string) => (p === CWD ? "" : p.startsWith(CWD + "/") ? p.slice(CWD.length + 1) : p);
	const run = (words: string[], opts: Partial<RunWordsInput> = {}) =>
		runWords({
			words,
			cwd: CWD,
			print: (l) => lines.push(l),
			warn: (l) => warnings.push(l),
			logger: noopLogger,
			exec,
			readFile: (p) => {
				const content = files[rel(p)];
				if (content === undefined) throw new Error(`ENOENT: ${p}`);
				return content;
			},
			fileExists: (p) => files[rel(p)] !== undefined,
			listDir: () => Object.keys(files).filter((f) => !f.includes("/")),
			lookPath: (_cwd, bin) => (bin === "prettier" ? "/bin/prettier" : null),
			...overrides,
			...opts,
		});
	return { run, exec, lines, warnings };
}

describe("runWords — a suite", () => {
	it("runs the leaves the repo lists, in registry order, whatever the order of the manifest", () => {
		const { run, exec } = setup({
			"package.json": PKG,
			"turbo.json": TURBO(["verification.typeSafety", "sourceQuality.staticAnalysis"]),
		});
		const report = run(["lint"], { config: { tasks: ["lint:data", "lint:code", "typecheck"] } });
		expect(report).toMatchObject({ status: "ok", jobs: [{ task: "lint:code" }, { task: "lint:data" }] });
		// lint:code through turbo (found under its old name), lint:data is yamllint, absent here: skipped.
		expect(exec).toHaveBeenCalledWith("turbo", ["run", "sourceQuality.staticAnalysis"], { cwd: CWD });
	});

	it("does not run a leaf the repo does not list", () => {
		const { run } = setup({ "package.json": PKG });
		const report = run(["test"], { config: { tasks: ["test:unit"] }, dryRun: true });
		expect((report as { jobs: unknown[] }).jobs).toHaveLength(1);
	});

	it("accepts the old names in the manifest", () => {
		const { run } = setup({ "package.json": PKG });
		const report = run(["scan"], { config: { tasks: ["security.secretDetection"] } });
		expect((report as { jobs: Array<{ task: string }> }).jobs.map((j) => j.task)).toEqual(["scan:secrets"]);
	});

	it("says so when the repo lists none of the suite's leaves", () => {
		const { run, lines } = setup({ "package.json": PKG });
		expect(run(["test"], { config: { tasks: ["typecheck"] } })).toEqual({ status: "unknown", jobs: [] });
		expect(run(["test"])).toEqual({ status: "unknown", jobs: [] });
		expect(lines[0]).toBe(
			"✗ no test tasks in this repo's config (the leaves are test:unit, test:visual, test:perf)"
		);
	});

	it("refuses arguments that belong to one leaf when the suite has several", () => {
		const { run, exec, lines } = setup({ "package.json": PKG });
		const config = { tasks: ["lint:code", "lint:data"] };
		expect(run(["lint", "code2"], { config })).toEqual({ status: "fail", jobs: [] });
		expect(run(["lint"], { config, passthrough: ["--fix"] })).toEqual({ status: "fail", jobs: [] });
		expect(run(["lint"], { config, check: true })).toEqual({ status: "fail", jobs: [] });
		expect(lines[0]).toContain('"code2" applies to one leaf, not to the 2 leaves of the suite');
		expect(exec).not.toHaveBeenCalled();
	});

	it("forwards arguments to the only leaf the repo lists", () => {
		const { run, exec } = setup({ "package.json": PKG, "turbo.json": TURBO(["sourceQuality.staticAnalysis"]) });
		run(["lint"], { config: { tasks: ["lint:code"] }, passthrough: ["--fix"] });
		expect(exec).toHaveBeenCalledWith("turbo", ["run", "sourceQuality.staticAnalysis", "--", "--fix"], {
			cwd: CWD,
		});
	});

	it("passes a task entry's job switches to its leaf", () => {
		const { run, exec } = setup({ "package.json": PKG }, { lookPath: () => "/bin/node" });
		run(["validate"], {
			config: { tasks: [{ name: "platform.repoValidation", jobs: { docsEnforcement: false } }] },
		});
		expect(exec.mock.calls.map((c) => c[1])).toEqual([[process.argv[1], "probe", "specs", "check"]]);
	});

	it("from a package directory runs only the package-scoped leaves, for that package, and reports the rest", () => {
		const files = { "package.json": PKG, "../turbo.json": "{}" };
		const { run, exec } = setup(files, {
			cwd: "/repo/pkgs/a",
			fileExists: (p) => p === "/repo/pkgs/a/package.json" || p === "/repo/turbo.json",
			readFile: () => TURBO(["verification.unitTests"]),
		});
		const report = run(["test"]) as { jobs: Array<{ task: string; status: string; message?: string }> };
		expect(report.jobs).toEqual([
			{ task: "test:visual", status: "skip", message: "skipped (repo-wide, run from the root)" },
			{ task: "test:perf", status: "skip", message: "skipped (repo-wide, run from the root)" },
			expect.objectContaining({ task: "test:unit" }),
		]);
		// the turbo workspace is above this directory, so the leaf runs its own tool here
		expect(exec).toHaveBeenCalledWith(expect.stringMatching(/vitest$/), ["run", "--coverage"], {
			cwd: "/repo/pkgs/a",
		});
	});
});

describe("runWords — a task", () => {
	it("`test unit` and `test:unit` are one call, and what is left is the job argument", () => {
		const { run, exec } = setup({ "package.json": PKG, "turbo.json": TURBO(["verification.unitTests"]) });
		run(["test", "unit"]);
		run(["test:unit"]);
		expect(exec).toHaveBeenCalledTimes(2);
		expect(exec.mock.calls[0]).toEqual(exec.mock.calls[1]);
		run(["test", "unit", "storybook"], { passthrough: ["--watch"] });
		expect(exec).toHaveBeenLastCalledWith(
			"turbo",
			["run", "verification.unitTests", "--", "--coverage", "storybook", "--watch"],
			{ cwd: CWD }
		);
	});

	it("runs a hyphen compound spelled any of three ways", () => {
		const { run, lines } = setup({ "package.json": PKG });
		for (const words of [["deploy-preview"], ["deploy:preview"], ["deploy", "preview"]]) {
			expect(run(words)).toMatchObject({
				status: "skip",
				message: "no local equivalent for deploy-preview — enforced in CI",
			});
		}
		expect(lines).toHaveLength(3);
	});

	it("an old dotted name still runs, and says on stderr that it is deprecated", () => {
		const { run, exec, warnings } = setup({ "package.json": PKG, "turbo.json": TURBO(["delivery.build"]) });
		expect(run(["delivery.build"]).status).toBe("ok");
		expect(exec).toHaveBeenCalledWith("turbo", ["run", "delivery.build"], { cwd: CWD });
		expect(warnings).toEqual(['"delivery.build" is a deprecated task name: use build']);
	});

	it("an old name that stood for several tasks runs each, prettier read-only", () => {
		const { run, exec, warnings } = setup({ "package.json": PKG });
		const report = run(["sourceQuality.formatting"], { dryRun: true });
		expect(report).toMatchObject({
			status: "dry-run",
			jobs: [
				{ task: "lint:editorconfig" },
				{ task: "lint:markdown" },
				{ task: "format", command: "prettier --check ." },
			],
		});
		expect(exec).not.toHaveBeenCalled();
		expect(warnings).toEqual([
			'"sourceQuality.formatting" is a deprecated task name: use lint:editorconfig, lint:markdown, format',
		]);
	});

	it("`format` writes, and `--check` is the read-only form that no package script stands in for", () => {
		const { run, exec } = setup({ "package.json": JSON.stringify({ scripts: { format: "prettier --write ." } }) });
		run(["format"]);
		expect(exec).toHaveBeenLastCalledWith(expect.stringMatching(/pnpm$/), ["run", "format"], { cwd: CWD });
		run(["format"], { check: true });
		expect(exec).toHaveBeenLastCalledWith(expect.stringMatching(/prettier$/), ["--check", "."], { cwd: CWD });
		run(["format", "--check"]);
		expect(exec).toHaveBeenLastCalledWith(expect.stringMatching(/prettier$/), ["--check", "."], { cwd: CWD });
	});

	it("an old name with a job reaches the job of the interim validate task", () => {
		const { run, exec } = setup({ "package.json": PKG });
		expect(run(["platform.repoValidation", "adrs"]).status).toBe("ok");
		expect(exec).toHaveBeenCalledWith(process.execPath, [process.argv[1], "probe", "specs", "check"], { cwd: CWD });
	});

	it("an old intent-group name runs the configured tasks that were under it, and says it is deprecated", () => {
		const { run, warnings } = setup({ "package.json": PKG });
		const report = run(["sourceQuality"], {
			config: { tasks: ["sourceQuality.formatting", "lint:data", "test:unit"] },
			dryRun: true,
		});
		expect((report as { jobs: Array<{ task: string }> }).jobs.map((j) => j.task)).toEqual([
			"lint:editorconfig",
			"lint:markdown",
			"format",
			"lint:data",
		]);
		expect(warnings).toEqual([
			'"sourceQuality" is a deprecated group name: use a suite (test, lint, scan) or the task ids it held',
		]);
	});

	it("a name that is nothing is still run when the repo has a script of that name, else it is unknown", () => {
		const { run, exec } = setup({ "package.json": JSON.stringify({ scripts: { codegen: "node gen.mjs" } }) });
		expect(run(["codegen", "now"], { config: { tasks: ["typecheck"] } }).status).toBe("ok");
		expect(exec).toHaveBeenCalledWith(expect.stringMatching(/pnpm$/), ["run", "codegen", "--", "now"], {
			cwd: CWD,
		});
		expect(run(["nope"]).status).toBe("unknown");
	});

	it("passes --filter, --affected, --base and --required to the task", () => {
		const { run, exec } = setup({ "package.json": PKG, "turbo.json": TURBO(["delivery.build"]) });
		run(["build"], { filter: "web", affected: true, base: "abc", env: {} });
		expect(exec).toHaveBeenCalledWith("turbo", ["run", "delivery.build", "--filter=web", "--affected"], {
			cwd: CWD,
			env: { TURBO_SCM_BASE: "abc" },
		});
		expect(run(["lint:commits"], { required: true, config: undefined }).status).toBe("skip");
	});
});
