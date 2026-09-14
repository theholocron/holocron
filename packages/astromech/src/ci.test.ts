import { describe, expect, it, vi } from "vitest";

import { type CiInput, runCi } from "./ci.js";
import type { RunLogger } from "./run.js";

const CWD = "/repo";
const noopLogger: RunLogger = { debug() {}, warn() {} };

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
		expect(report.jobs.map((j) => j.task)).toEqual([
			"verification.typeSafety",
			"sourceQuality.staticAnalysis",
			"verification.unitTests",
		]);
		expect(report.jobs.map((j) => j.checkContext)).toEqual([
			"Typecheck / tsc --noEmit",
			"Static Analysis / Run eslint and actionlint",
			"Test / Conclusion",
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
		expect(report.jobs.map((j) => j.task)).toEqual(["verification.typeSafety", "verification.unitTests"]);
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
		expect(report.jobs.map((j) => j.task).sort()).toEqual([
			"delivery.build",
			"verification.typeSafety",
			"verification.unitTests",
		]);
	});

	it("falls back to all ci:true tasks when nothing is required", () => {
		const { run, lines } = makeCi({
			"package.json": PKG,
			"turbo.json": TURBO(["verification.unitTests", "sourceQuality.staticAnalysis"]),
		});
		const report = run({ tasks: ["verification.unitTests", "sourceQuality.staticAnalysis"] });
		expect(report.jobs.map((j) => j.task)).toEqual(["sourceQuality.staticAnalysis", "verification.unitTests"]);
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
		const codeScanning = report.jobs.find((j) => j.task === "security.codeScanning")!;
		expect(codeScanning.status).toBe("skip");
		expect(codeScanning.message).toMatch(/enforced in CI/);
	});

	it("expands a jobs-bearing task into its sub-jobs, each under its own check context", () => {
		const { run, exec, lines } = makeCi(
			{ "package.json": PKG },
			{ lookPath: (_c: string, bin: string) => (bin === "node" ? "/usr/bin/node" : null) }
		);
		const report = run({ tasks: [{ name: "platform.repoValidation", required: true }] });
		expect(report.status).toBe("ok");
		const out = lines.join("\n");
		expect(out).toContain("▶ platform.repoValidation");
		expect(exec.mock.calls.map((c) => c[1])).toEqual([
			["scripts/validate-adrs.mjs"],
			["scripts/validate-registry.mjs"],
			["scripts/validate-docs-presence.mjs"],
		]);
		// still one task-level row in the report
		expect(report.jobs.find((j) => j.task === "platform.repoValidation")!.status).toBe("ok");
	});

	it("does not fail `holocron ci` when a jobs-bearing task is required but no sub-job runs locally", () => {
		const { run, exec } = makeCi({ "package.json": PKG }); // node not on PATH
		const report = run({ tasks: [{ name: "platform.repoValidation", required: true }] });
		expect(report.status).toBe("ok");
		expect(exec).not.toHaveBeenCalled();
		expect(report.jobs.find((j) => j.task === "platform.repoValidation")!.status).toBe("skip");
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
			["run", "verification.unitTests", "--filter=@scope/cli", "--", "--coverage"],
			{ cwd: CWD }
		);
	});

	it("de-dupes task entries by name (last wins)", () => {
		const { run } = makeCi({ "package.json": PKG, "turbo.json": TURBO(["verification.unitTests"]) });
		const report = run({
			tasks: [{ name: "verification.unitTests" }, { name: "verification.unitTests", required: true }],
		});
		expect(report.jobs.map((j) => j.task)).toEqual(["verification.unitTests"]);
	});

	it("resolves a linterGroup task's fixed tool set natively when no turbo/script entry exists", () => {
		const { run, exec } = makeCi(
			{ "package.json": PKG },
			{ lookPath: (_c, b) => (b === "prettier" ? `/usr/local/bin/${b}` : null) }
		);
		run({ tasks: [{ name: "sourceQuality.formatting", required: true }] });
		expect(exec).toHaveBeenCalledWith("/usr/local/bin/prettier", ["--check", "."], { cwd: CWD });
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
		expect(lines.join("\n")).toMatch(/✗ 1 failed, 0 passed, 1 skipped/);
	});
});
