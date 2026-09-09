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
			"turbo.json": TURBO(["test", "typecheck", "lint"]),
			"eslint.config.ts": "", // → lint's eslint slot runs via turbo
		});
		const report = run({
			tasks: [
				{ name: "lint", required: true },
				{ name: "test", required: true },
				{ name: "typecheck", required: true },
				"build", // not required → excluded
			],
		});
		expect(report.status).toBe("ok");
		expect(report.jobs.map((j) => j.task)).toEqual(["typecheck", "lint", "test"]);
		expect(report.jobs.map((j) => j.checkContext)).toEqual([
			"Typecheck / Conclusion",
			"Lint / Conclusion",
			"Test / Conclusion",
		]);
		expect(exec).toHaveBeenCalledWith(expect.stringMatching(/turbo$/), ["run", "typecheck"], { cwd: CWD });
	});

	it("orders by CI_ORDER regardless of manifest order", () => {
		const { run } = makeCi({ "package.json": PKG, "turbo.json": TURBO(["test", "typecheck"]) });
		const report = run({
			tasks: [
				{ name: "test", required: true },
				{ name: "typecheck", required: true },
			],
		});
		expect(report.jobs.map((j) => j.task)).toEqual(["typecheck", "test"]);
	});

	it("--all runs every ci:true known task", () => {
		const { run } = makeCi({ "package.json": PKG, "turbo.json": TURBO(["test", "typecheck", "build"]) });
		const report = run({ tasks: ["test", "typecheck", "build", { name: "audit", ci: false }] }, { scope: "all" });
		expect(report.jobs.map((j) => j.task).sort()).toEqual(["build", "test", "typecheck"]);
	});

	it("falls back to all ci:true tasks when nothing is required", () => {
		const { run, lines } = makeCi({ "package.json": PKG, "turbo.json": TURBO(["test", "lint"]) });
		const report = run({ tasks: ["test", "lint"] });
		expect(report.jobs.map((j) => j.task)).toEqual(["lint", "test"]);
		expect(lines.join("\n")).toMatch(/no required tasks in the manifest/);
	});

	it("reports a local:null task with no repo runner as skipped, never a failure", () => {
		const { run } = makeCi({ "package.json": PKG, "turbo.json": TURBO(["test"]) });
		const report = run({
			tasks: [
				{ name: "test", required: true },
				{ name: "audit", required: true },
			],
		});
		expect(report.status).toBe("ok");
		const audit = report.jobs.find((j) => j.task === "audit")!;
		expect(audit.status).toBe("skip");
		expect(audit.message).toMatch(/enforced in CI/);
	});

	it("runs a local:null task via an explicit package.json script (audit → knip)", () => {
		const { run, exec } = makeCi({
			"package.json": JSON.stringify({ name: "@scope/x", scripts: { audit: "knip" } }),
		});
		const report = run({ tasks: [{ name: "audit", required: true }] });
		expect(report.status).toBe("ok");
		expect(report.jobs[0]!.status).toBe("ok");
		expect(exec).toHaveBeenCalledWith(expect.stringMatching(/pnpm$/), ["run", "audit"], { cwd: CWD });
	});

	it("fails the run when a local:null task's explicit script exits non-zero", () => {
		const { run } = makeCi(
			{ "package.json": JSON.stringify({ name: "@scope/x", scripts: { audit: "knip" } }) },
			{ exec: () => ({ exitCode: 1 }) }
		);
		const report = run({ tasks: [{ name: "audit", required: true }] });
		expect(report.status).toBe("fail");
	});

	it("a required task with no runnable local runner fails the run", () => {
		const { run } = makeCi({ "package.json": PKG }); // no turbo, no build tooling
		const report = run({ tasks: [{ name: "build", required: true }] });
		expect(report.status).toBe("fail");
		expect(report.jobs[0]!.status).toBe("fail");
	});

	it("a non-required task with no runner skips cleanly (--all)", () => {
		const { run } = makeCi({ "package.json": PKG });
		const report = run({ tasks: ["build"] }, { scope: "all" });
		expect(report.status).toBe("ok");
		expect(report.jobs[0]!.status).toBe("skip");
	});

	it("propagates a non-zero exit as a failure", () => {
		const { run } = makeCi(
			{ "package.json": PKG, "turbo.json": TURBO(["test"]) },
			{ exec: () => ({ exitCode: 1 }) }
		);
		const report = run({ tasks: [{ name: "test", required: true }] });
		expect(report.status).toBe("fail");
	});

	it("--dry-run prints the plan and runs nothing", () => {
		const { run, exec, lines } = makeCi({ "package.json": PKG, "turbo.json": TURBO(["test", "typecheck"]) });
		const report = run(
			{
				tasks: [
					{ name: "test", required: true },
					{ name: "typecheck", required: true },
				],
			},
			{ dryRun: true }
		);
		expect(report.status).toBe("ok");
		expect(exec).not.toHaveBeenCalled();
		expect(lines.join("\n")).toMatch(/would run: .*turbo run typecheck/);
		expect(lines.join("\n")).toMatch(/plan only/);
	});

	it("--filter is forwarded to turbo", () => {
		const { run, exec } = makeCi({ "package.json": PKG, "turbo.json": TURBO(["test"]) });
		run({ tasks: [{ name: "test", required: true }] }, { filter: "@scope/cli" });
		expect(exec).toHaveBeenCalledWith(expect.stringMatching(/turbo$/), ["run", "test", "--filter=@scope/cli"], {
			cwd: CWD,
		});
	});

	it("de-dupes task entries by name (last wins)", () => {
		const { run } = makeCi({ "package.json": PKG, "turbo.json": TURBO(["test"]) });
		const report = run({ tasks: [{ name: "test" }, { name: "test", required: true }] });
		expect(report.jobs.map((j) => j.task)).toEqual(["test"]);
	});

	it("passes the lint entry's linters through to the lint aggregate", () => {
		const { run, exec } = makeCi(
			{ "package.json": PKG, "turbo.json": TURBO(["lint"]), "eslint.config.ts": "" },
			{ lookPath: (_c, b) => (b === "prettier" ? `/usr/local/bin/${b}` : null) }
		);
		run({ tasks: [{ name: "lint", required: true, linters: ["eslint", "prettier"] }] });
		expect(exec).toHaveBeenCalledWith(expect.stringMatching(/turbo$/), ["run", "lint"], { cwd: CWD });
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
				{ name: "build", required: true }, // no runner → fail
				{ name: "audit", required: true }, // local: null → skip
			],
		});
		expect(report.status).toBe("fail");
		expect(lines.join("\n")).toMatch(/✗ 1 failed, 0 passed, 1 skipped/);
	});
});
