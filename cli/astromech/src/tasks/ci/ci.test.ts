import { describe, expect, it, vi } from "vitest";

import { noopLogger } from "../../utils/index.js";
import { runCi } from "./ci.js";
import type { CiInput } from "./ci.type.js";

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

function makeCi(files: Record<string, string>, overrides: Partial<CiInput> = {}) {
	const exec = vi.fn((_c: string, _a: string[], _o: { cwd: string }) => ({ exitCode: 0 }));
	const lines: string[] = [];
	const fs = makeFs(files);
	const run = (config: CiInput["config"], opts: Partial<CiInput> = {}) =>
		runCi({
			cwd: CWD,
			config,
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

describe("runCi", () => {
	it("runs only the required tasks, in CI_ORDER", () => {
		const { run, exec } = makeCi({
			"package.json": PKG,
			"turbo.json": TURBO(["verification.unitTests", "verification.typeSafety", "sourceQuality.staticAnalysis"]),
		});
		const report = run({
			tasks: [
				{ name: "sourceQuality.staticAnalysis", required: true },
				{ name: "verification.unitTests", required: true },
				{ name: "verification.typeSafety", required: true },
				"delivery.build", // not required → excluded
			],
		});
		expect(report.status).toBe("ok");
		expect(report.jobs.map((j) => j.task)).toEqual(["typecheck", "lint:code", "test:unit"]);
		expect(report.jobs.map((j) => j.checkContext)).toEqual([
			"typecheck / Run tsc --noEmit",
			"lint:code / Run eslint, actionlint and prettier",
			"test:unit / Conclusion",
		]);
		expect(exec).toHaveBeenCalledWith(expect.stringMatching(/turbo$/), ["run", "verification.typeSafety"], {
			cwd: CWD,
		});
	});

	it("orders by CI_ORDER regardless of manifest order", () => {
		const { run } = makeCi({
			"package.json": PKG,
			"turbo.json": TURBO(["verification.unitTests", "verification.typeSafety"]),
		});
		const report = run({
			tasks: [
				{ name: "verification.unitTests", required: true },
				{ name: "verification.typeSafety", required: true },
			],
		});
		expect(report.jobs.map((j) => j.task)).toEqual(["typecheck", "test:unit"]);
	});

	it("--all runs every ci:true known task", () => {
		const { run } = makeCi({
			"package.json": PKG,
			"turbo.json": TURBO(["verification.unitTests", "verification.typeSafety", "delivery.build"]),
		});
		const report = run(
			{
				tasks: [
					"verification.unitTests",
					"verification.typeSafety",
					"delivery.build",
					{ name: "security.codeScanning", ci: false },
				],
			},
			{ scope: "all" }
		);
		expect(report.jobs.map((j) => j.task).sort()).toEqual(["build", "test:unit", "typecheck"]);
	});

	it("falls back to all ci:true tasks when nothing is required", () => {
		const { run, lines } = makeCi({
			"package.json": PKG,
			"turbo.json": TURBO(["verification.unitTests", "sourceQuality.staticAnalysis"]),
		});
		const report = run({ tasks: ["verification.unitTests", "sourceQuality.staticAnalysis"] });
		expect(report.jobs.map((j) => j.task)).toEqual(["lint:code", "test:unit"]);
		expect(lines.join("\n")).toMatch(/no required tasks in the manifest/);
	});

	it("reports a local:null task with no repo runner as skipped, never a failure", () => {
		const { run } = makeCi({ "package.json": PKG, "turbo.json": TURBO(["verification.unitTests"]) });
		const report = run({
			tasks: [
				{ name: "verification.unitTests", required: true },
				{ name: "security.codeScanning", required: true },
			],
		});
		expect(report.status).toBe("ok");
		const codeScanning = report.jobs.find((j) => j.task === "scan:code")!;
		expect(codeScanning.status).toBe("skip");
		expect(codeScanning.message).toMatch(/enforced in CI/);
	});

	it("runs each validate leaf under its own check context, and an old name that stood for both runs both", () => {
		const { run, exec, lines } = makeCi({ "package.json": PKG });
		for (const name of ["platform.repoValidation", "validate"]) {
			exec.mockClear();
			lines.length = 0;
			const report = run({ tasks: [{ name, required: true }] });
			expect(report.status).toBe("ok");
			expect(report.jobs.map((j) => [j.task, j.checkContext])).toEqual([
				["validate:specs", "validate:specs / Validate ADRs and specs"],
				["validate:docs", "validate:docs / Validate docs presence"],
			]);
			const out = lines.join("\n");
			expect(out.indexOf("▶ validate:specs /")).toBeLessThan(out.indexOf("▶ validate:docs /"));
			expect(exec.mock.calls.map((c) => c[1])).toEqual([
				[process.argv[1], "probe", "specs", "check"],
				[process.argv[1], "probe", "docs", "validate"],
			]);
		}
	});

	it("runs a local:null task via an explicit package.json script", () => {
		const { run, exec } = makeCi({
			"package.json": JSON.stringify({ name: "@scope/x", scripts: { "security.codeScanning": "some-scan" } }),
		});
		const report = run({ tasks: [{ name: "security.codeScanning", required: true }] });
		expect(report.status).toBe("ok");
		expect(report.jobs[0]!.status).toBe("ok");
		expect(exec).toHaveBeenCalledWith(expect.stringMatching(/pnpm$/), ["run", "security.codeScanning"], {
			cwd: CWD,
		});
	});

	it("fails the run when a local:null task's explicit script exits non-zero", () => {
		const { run } = makeCi(
			{ "package.json": JSON.stringify({ name: "@scope/x", scripts: { "security.codeScanning": "some-scan" } }) },
			{ exec: () => ({ exitCode: 1 }) }
		);
		const report = run({ tasks: [{ name: "security.codeScanning", required: true }] });
		expect(report.status).toBe("fail");
	});

	it("a required task with no runnable local runner fails the run", () => {
		const { run } = makeCi({ "package.json": PKG }); // no turbo, no build tooling
		const report = run({ tasks: [{ name: "delivery.build", required: true }] });
		expect(report.status).toBe("fail");
		expect(report.jobs[0]!.status).toBe("fail");
	});

	it("a non-required task with no runner skips cleanly (--all)", () => {
		const { run } = makeCi({ "package.json": PKG });
		const report = run({ tasks: ["delivery.build"] }, { scope: "all" });
		expect(report.status).toBe("ok");
		expect(report.jobs[0]!.status).toBe("skip");
	});

	it("propagates a non-zero exit as a failure", () => {
		const { run } = makeCi(
			{ "package.json": PKG, "turbo.json": TURBO(["verification.unitTests"]) },
			{ exec: () => ({ exitCode: 1 }) }
		);
		const report = run({ tasks: [{ name: "verification.unitTests", required: true }] });
		expect(report.status).toBe("fail");
	});

	it("--dry-run prints the plan and runs nothing", () => {
		const { run, exec, lines } = makeCi({
			"package.json": PKG,
			"turbo.json": TURBO(["verification.unitTests", "verification.typeSafety"]),
		});
		const report = run(
			{
				tasks: [
					{ name: "verification.unitTests", required: true },
					{ name: "verification.typeSafety", required: true },
				],
			},
			{ dryRun: true }
		);
		expect(report.status).toBe("ok");
		expect(exec).not.toHaveBeenCalled();
		expect(lines.join("\n")).toMatch(/would run: .*turbo run verification\.typeSafety/);
		expect(lines.join("\n")).toMatch(/plan only/);
	});

	it("--filter is forwarded to turbo", () => {
		const { run, exec } = makeCi({ "package.json": PKG, "turbo.json": TURBO(["verification.unitTests"]) });
		run({ tasks: [{ name: "verification.unitTests", required: true }] }, { filter: "@scope/cli" });
		expect(exec).toHaveBeenCalledWith(
			expect.stringMatching(/turbo$/),
			["run", "verification.unitTests", "--filter=@scope/cli"],
			{ cwd: CWD }
		);
	});

	it("--affected and --base reach turbo", () => {
		const { run, exec } = makeCi({ "package.json": PKG, "turbo.json": TURBO(["verification.unitTests"]) });
		run({ tasks: [{ name: "verification.unitTests", required: true }] }, { affected: true, base: "abc", env: {} });
		expect(exec).toHaveBeenCalledWith(
			expect.stringMatching(/turbo$/),
			["run", "verification.unitTests", "--affected"],
			{ cwd: CWD, env: { TURBO_SCM_BASE: "abc" } }
		);
	});

	it("de-dupes task entries by name (last wins)", () => {
		const { run } = makeCi({ "package.json": PKG, "turbo.json": TURBO(["verification.unitTests"]) });
		const report = run({
			tasks: [{ name: "verification.unitTests" }, { name: "verification.unitTests", required: true }],
		});
		expect(report.jobs.map((j) => j.task)).toEqual(["test:unit"]);
	});

	it("resolves a linterGroup task's fixed tool set natively when no turbo/script entry exists", () => {
		const { run, exec } = makeCi(
			{ "package.json": PKG },
			{ lookPath: (_c, b) => (b === "prettier" ? `/usr/local/bin/${b}` : null) }
		);
		run({ tasks: [{ name: "sourceQuality.formatting", required: true }] });
		expect(exec).toHaveBeenCalledWith(expect.stringMatching(/prettier$/), ["--check", "."], { cwd: CWD });
	});

	it("runs the old formatting name as its three successors, prettier read-only, and never fails for a missing tool", () => {
		const { run, exec } = makeCi(
			{ "package.json": PKG },
			{ lookPath: (_c, b) => (b === "prettier" ? `/usr/local/bin/${b}` : null) }
		);
		const report = run({ tasks: [{ name: "sourceQuality.formatting", required: true }] });
		expect(report.status).toBe("ok");
		expect(report.jobs.map((j) => j.task)).toEqual(["lint:editorconfig", "lint:markdown", "format"]);
		// prettier is a step of `lint:code`, so `format` has no context of its own
		expect(report.jobs.map((j) => j.checkContext)).toEqual([
			"lint:editorconfig / Run editorconfig-checker",
			"lint:markdown / Run markdownlint",
			null,
		]);
		expect(exec).toHaveBeenCalledTimes(1);
		expect(exec).toHaveBeenCalledWith(expect.stringMatching(/prettier$/), ["--check", "."], { cwd: CWD });
	});

	it("accepts the flat ids in the manifest, in the same order", () => {
		const { run } = makeCi({
			"package.json": PKG,
			"turbo.json": TURBO(["verification.unitTests", "verification.typeSafety"]),
		});
		const report = run({
			tasks: [
				{ name: "test:unit", required: true },
				{ name: "typecheck", required: true },
			],
		});
		expect(report.jobs.map((j) => [j.task, j.checkContext])).toEqual([
			["typecheck", "typecheck / Run tsc --noEmit"],
			["test:unit", "test:unit / Conclusion"],
		]);
	});

	it("nothing to run → status ok, notice printed", () => {
		const { run, lines } = makeCi({ "package.json": PKG });
		const report = run({});
		expect(report.status).toBe("ok");
		expect(report.jobs).toEqual([]);
		expect(lines.join("\n")).toMatch(/nothing to run/);
	});

	it("summarises failures alongside skips", () => {
		const { run, lines } = makeCi({ "package.json": PKG }); // no turbo, no tooling
		const report = run({
			tasks: [
				{ name: "delivery.build", required: true }, // no runner → fail
				{ name: "security.codeScanning", required: true }, // local: null → skip
			],
		});
		expect(report.status).toBe("fail");
		expect(lines.join("\n")).toMatch(/✗ 0 passed, 1 failed, 1 skipped/);
	});

	it("names each failed job after the count, and never a passing or skipped one", () => {
		const { run, lines } = makeCi({ "package.json": PKG });
		run({
			tasks: [
				{ name: "delivery.build", required: true }, // no runner → fail
				{ name: "security.codeScanning", required: true }, // local: null → skip
			],
		});
		const summary = lines.slice(lines.findIndex((l) => l.startsWith("✗ ")));
		expect(summary).toHaveLength(2);
		expect(summary[1]).toMatch(/^ {2}✗ build/);
	});

	it("names a failed job that has no check context by its task id", () => {
		const { run, lines } = makeCi({ "package.json": PKG }, { exec: () => ({ exitCode: 1 }) });
		run({ tasks: [{ name: "format", required: true }] });
		expect(lines).toContain("  ✗ format");
	});
});
