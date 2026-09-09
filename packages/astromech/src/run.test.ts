import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { type RunLogger, runTask, type RunTaskInput } from "./run.js";

const CWD = "/repo";

const noopLogger: RunLogger = { debug() {}, warn() {} };

/** Build injectable fs helpers from a flat file map (paths relative to CWD). */
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

function makeRun(files: Record<string, string>, overrides: Partial<RunTaskInput> = {}) {
	const exec = vi.fn((_cmd: string, _args: string[], _o: { cwd: string }) => ({ exitCode: 0 }));
	const lines: string[] = [];
	const fs = makeFs(files);
	/** By default nothing is on PATH; per-test `lookPath` overrides opt bins in. */
	const lookPath = vi.fn((_cwd: string, _bin: string): string | null => null);
	const call = (task: string, extra: Partial<RunTaskInput> = {}) =>
		runTask({
			task,
			cwd: CWD,
			print: (l) => lines.push(l),
			logger: noopLogger,
			exec,
			readFile: fs.readFile,
			fileExists: fs.fileExists,
			listDir: fs.listDir,
			lookPath,
			...overrides,
			...extra,
		});
	return { call, exec, lines, lookPath };
}

const PKG = (extra: Record<string, unknown> = {}) => JSON.stringify({ name: "@scope/x", ...extra });

describe("runTask", () => {
	it("delegates to turbo at a monorepo root", () => {
		const { call, exec } = makeRun({
			"package.json": PKG(),
			"turbo.json": JSON.stringify({ tasks: { test: {}, build: {} } }),
			"pnpm-lock.yaml": "",
		});
		const report = call("test");
		expect(report.status).toBe("ok");
		expect(exec).toHaveBeenCalledWith(expect.stringMatching(/turbo$/), ["run", "test"], { cwd: CWD });
	});

	it("forwards passthrough args to turbo after --", () => {
		const { call, exec } = makeRun({
			"package.json": PKG(),
			"turbo.json": JSON.stringify({ tasks: { test: {} } }),
		});
		call("test", { passthrough: ["--filter", "@scope/x"] });
		expect(exec).toHaveBeenCalledWith(expect.any(String), ["run", "test", "--", "--filter", "@scope/x"], {
			cwd: CWD,
		});
	});

	it("runs the registry tool with org-default flags", () => {
		const { call, exec } = makeRun({
			"package.json": PKG(),
			"node_modules/.bin/vitest": "#!/bin/sh",
		});
		call("test");
		expect(exec).toHaveBeenCalledWith(join(CWD, "node_modules/.bin/vitest"), ["run", "--coverage"], { cwd: CWD });
	});

	it("resolves the build tool from a detect[] match", () => {
		const { call, exec } = makeRun({ "package.json": PKG(), "tsdown.config.ts": "" });
		call("build");
		expect(exec).toHaveBeenCalledWith("tsdown", [], { cwd: CWD });
	});

	it("prefers vite when vite.config is present", () => {
		const { call, exec } = makeRun({ "package.json": PKG(), "vite.config.ts": "" });
		call("build");
		expect(exec).toHaveBeenCalledWith("vite", ["build"], { cwd: CWD });
	});

	it("an explicit package.json script wins over the registry default", () => {
		const { call, exec } = makeRun({
			"package.json": PKG({ scripts: { build: "make" }, packageManager: "pnpm@10.0.0" }),
			"tsdown.config.ts": "", // registry would pick tsdown — the script overrides
		});
		const report = call("build");
		expect(report.status).toBe("ok");
		expect(exec).toHaveBeenCalledWith("pnpm", ["run", "build"], { cwd: CWD });
	});

	it("ignores a `holocron run` thin-caller script and uses the registry (no recursion)", () => {
		const { call, exec } = makeRun({
			"package.json": PKG({ scripts: { test: "holocron run test" } }),
			"node_modules/.bin/vitest": "",
		});
		call("test");
		expect(exec).toHaveBeenCalledWith(join(CWD, "node_modules/.bin/vitest"), ["run", "--coverage"], { cwd: CWD });
	});

	it("forwards `-- <passthrough>` to a package.json script", () => {
		const { call, exec } = makeRun({
			"package.json": PKG({ scripts: { test: "vitest" } }),
			"pnpm-lock.yaml": "",
		});
		call("test", { passthrough: ["--watch"] });
		expect(exec).toHaveBeenCalledWith("pnpm", ["run", "test", "--", "--watch"], { cwd: CWD });
	});

	it("resolves a registry task with no package.json at all", () => {
		const { call, exec } = makeRun({ "node_modules/.bin/tsc": "" });
		const report = call("typecheck");
		expect(report.status).toBe("ok");
		expect(exec).toHaveBeenCalledWith(join(CWD, "node_modules/.bin/tsc"), ["--noEmit"], { cwd: CWD });
	});

	it("detects the package manager from the lockfile when packageManager is absent", () => {
		const { call, exec } = makeRun({
			"package.json": PKG({ scripts: { typecheck: "tsc -p ." } }),
			"bun.lockb": "",
		});
		call("typecheck");
		expect(exec).toHaveBeenCalledWith("bun", ["run", "typecheck"], { cwd: CWD });
	});

	it("defaults the package manager to pnpm with no field and no lockfile", () => {
		const { call, exec } = makeRun({ "package.json": PKG({ scripts: { typecheck: "tsc -p ." } }) });
		call("typecheck");
		expect(exec).toHaveBeenCalledWith("pnpm", ["run", "typecheck"], { cwd: CWD });
	});

	it("treats a listDir failure as 'no runner' for a detect[] task", () => {
		const { call, exec } = makeRun(
			{ "package.json": PKG(), "tsdown.config.ts": "" },
			{
				listDir: () => {
					throw new Error("EACCES");
				},
			}
		);
		const report = call("build");
		expect(report.status).toBe("skip");
		expect(exec).not.toHaveBeenCalled();
	});

	it("skips (exit 0) a known task the repo can't run", () => {
		const { call, exec, lines } = makeRun({ "package.json": PKG() }); // no build tooling, no script
		const report = call("build");
		expect(report.status).toBe("skip");
		expect(exec).not.toHaveBeenCalled();
		expect(lines.join("\n")).toContain("no build task for this repo");
	});

	it("fails (exit 1) on a can't-run known task when --required", () => {
		const { call } = makeRun({ "package.json": PKG() });
		const report = call("build", { required: true });
		expect(report.status).toBe("fail");
	});

	it("returns unknown for a task that is neither a registry key nor a script", () => {
		const { call } = makeRun({ "package.json": PKG() });
		const report = call("frobnicate");
		expect(report.status).toBe("unknown");
		expect(report.message).toBe('unknown task "frobnicate"');
	});

	it("propagates a non-zero exit from the tool", () => {
		const { call } = makeRun(
			{ "package.json": PKG(), "node_modules/.bin/tsc": "" },
			{ exec: () => ({ exitCode: 2 }) }
		);
		const report = call("typecheck");
		expect(report.status).toBe("fail");
		expect(report.message).toMatch(/exited 2/);
	});

	it("invokes the CLI itself for a task backed by a holocron subcommand", () => {
		const { call, exec } = makeRun({ "package.json": PKG() });
		call("sync", { passthrough: ["--steps", "readme"] });
		expect(exec).toHaveBeenCalledWith(process.execPath, [process.argv[1], "sync", "--steps", "readme"], {
			cwd: CWD,
		});
	});

	it("reports a task with no local equivalent as skipped — even when --required", () => {
		const { call, exec, lines } = makeRun({ "package.json": PKG() });
		const report = call("codeql", { required: true });
		expect(report.status).toBe("skip");
		expect(report.message).toMatch(/enforced in CI/);
		expect(lines.join("\n")).not.toContain("✗");
		expect(exec).not.toHaveBeenCalled();
	});

	it("still runs an explicit package.json script for a local:null task (audit → knip)", () => {
		const { call, exec } = makeRun({ "package.json": PKG({ scripts: { audit: "knip" } }) });
		const report = call("audit", { required: true });
		expect(report.status).toBe("ok");
		expect(exec).toHaveBeenCalledWith(expect.stringMatching(/pnpm$/), ["run", "audit"], { cwd: CWD });
	});

	it.each([
		["yarn.lock", "yarn"],
		["package-lock.json", "npm"],
	])("detects %s → %s", (lockfile, pm) => {
		const { call, exec } = makeRun({
			"package.json": PKG({ scripts: { format: "prettier -w ." } }),
			[lockfile]: "",
		});
		call("format");
		expect(exec).toHaveBeenCalledWith(pm, ["run", "format"], { cwd: CWD });
	});

	it("treats a malformed turbo.json / package.json as absent", () => {
		const { call, exec } = makeRun({
			"package.json": "{ not json",
			"turbo.json": "{ also not json",
			"node_modules/.bin/tsc": "",
		});
		const report = call("typecheck");
		expect(report.status).toBe("ok");
		expect(exec).toHaveBeenCalledWith(join(CWD, "node_modules/.bin/tsc"), ["--noEmit"], { cwd: CWD });
	});

	it("--dry-run prints the resolved command and runs nothing", () => {
		const { call, exec, lines } = makeRun({
			"package.json": PKG(),
			"turbo.json": JSON.stringify({ pipeline: { test: {} } }),
		});
		const report = call("test", { dryRun: true });
		expect(report.status).toBe("dry-run");
		expect(exec).not.toHaveBeenCalled();
		expect(lines.join("\n")).toMatch(/would run: .*turbo run test/);
	});
});

describe("runTask — sub-jobs", () => {
	const onPath =
		(...bins: string[]) =>
		(_cwd: string, bin: string): string | null =>
			bins.includes(bin) ? `/usr/local/bin/${bin}` : null;

	it("runs one named job — `audit knip` → knip", () => {
		const { call, exec } = makeRun({ "package.json": PKG() }, { lookPath: onPath("knip") });
		const report = call("audit", { job: "knip" });
		expect(report.status).toBe("ok");
		expect(exec).toHaveBeenCalledWith("/usr/local/bin/knip", [], { cwd: CWD });
	});

	it("forwards passthrough args to the job's tool", () => {
		const { call, exec } = makeRun({ "package.json": PKG() }, { lookPath: onPath("knip") });
		call("audit", { job: "knip", passthrough: ["--reporter", "json"] });
		expect(exec).toHaveBeenCalledWith("/usr/local/bin/knip", ["--reporter", "json"], { cwd: CWD });
	});

	it("detects a lighthouse config for `audit performance` → lhci autorun", () => {
		const { call, exec } = makeRun(
			{ "package.json": PKG(), "lighthouse.config.cjs": "" },
			{ lookPath: onPath("lhci") }
		);
		const report = call("audit", { job: "performance" });
		expect(report.status).toBe("ok");
		expect(exec).toHaveBeenCalledWith("/usr/local/bin/lhci", ["autorun"], { cwd: CWD });
	});

	it("skips `audit performance` when the repo has no lighthouse config", () => {
		const { call, exec, lines } = makeRun({ "package.json": PKG() }, { lookPath: onPath("lhci") });
		const report = call("audit", { job: "performance" });
		expect(report.status).toBe("skip");
		expect(exec).not.toHaveBeenCalled();
		expect(lines.join("\n")).toMatch(/no audit performance runner/);
	});

	it("skips a job whose tool isn't installed locally — enforced in CI", () => {
		const { call, exec, lines } = makeRun({ "package.json": PKG() }); // nothing on PATH
		const report = call("audit", { job: "knip" });
		expect(report.status).toBe("skip");
		expect(exec).not.toHaveBeenCalled();
		expect(lines.join("\n")).toMatch(/knip not installed locally.*enforced in CI/);
	});

	it("--required turns a missing job tool into a failure", () => {
		const { call } = makeRun({ "package.json": PKG() });
		const report = call("audit", { job: "knip", required: true });
		expect(report.status).toBe("fail");
	});

	it("rejects an unknown job with the known list, exit 1", () => {
		const { call, lines } = makeRun({ "package.json": PKG() });
		const report = call("audit", { job: "frobnicate" });
		expect(report.status).toBe("unknown");
		expect(report.message).toBe('unknown job "audit frobnicate"');
		expect(lines.join("\n")).toMatch(/known: bundle-size, knip, performance/);
	});

	it("`holocron run audit` with no job runs every job in declared order", () => {
		const { call, exec, lines } = makeRun(
			{ "package.json": PKG(), "lighthouse.config.cjs": "" },
			{ lookPath: onPath("knip", "lhci") }
		);
		const report = call("audit");
		expect(report.status).toBe("ok");
		expect(exec.mock.calls.map((c) => c[0])).toEqual(["/usr/local/bin/knip", "/usr/local/bin/lhci"]);
		const out = lines.join("\n");
		expect(out.indexOf("audit / Knip")).toBeLessThan(out.indexOf("audit / Audit the performance"));
		expect(out).toMatch(/audit bundle-size — enforced in CI/);
	});

	it("`holocron run audit --dry-run` plans every job and runs nothing", () => {
		const { call, exec, lines } = makeRun(
			{ "package.json": PKG(), "lighthouse.config.cjs": "" },
			{ lookPath: onPath("knip", "lhci") }
		);
		const report = call("audit", { dryRun: true });
		expect(report.status).toBe("dry-run");
		expect(exec).not.toHaveBeenCalled();
		expect(lines.join("\n")).toMatch(/would run: .*knip[\s\S]*would run: .*lhci autorun/);
	});

	it("`holocron run audit` is a clean skip when no job is runnable locally", () => {
		const { call, exec } = makeRun({ "package.json": PKG() });
		const report = call("audit");
		expect(report.status).toBe("skip");
		expect(exec).not.toHaveBeenCalled();
		expect(report.message).toMatch(/no audit job has a local equivalent/);
	});

	it("`holocron run audit` fails the run when one job fails", () => {
		const { call } = makeRun(
			{ "package.json": PKG() },
			{ lookPath: onPath("knip"), exec: () => ({ exitCode: 1 }) }
		);
		const report = call("audit");
		expect(report.status).toBe("fail");
		expect(report.message).toMatch(/one or more audit jobs failed/);
	});

	it("folds a job-position arg into passthrough for a task with no jobs (`build src/`)", () => {
		const { call, exec } = makeRun({
			"package.json": PKG(),
			"tsdown.config.ts": "",
			"node_modules/.bin/tsdown": "",
		});
		call("build", { job: "src/" });
		expect(exec).toHaveBeenCalledWith(join(CWD, "node_modules/.bin/tsdown"), ["src/"], { cwd: CWD });
	});

	it("an explicit `audit` script still wins over job expansion", () => {
		const { call, exec } = makeRun({ "package.json": PKG({ scripts: { audit: "knip" } }) });
		const report = call("audit");
		expect(report.status).toBe("ok");
		expect(exec).toHaveBeenCalledWith(expect.stringMatching(/pnpm$/), ["run", "audit"], { cwd: CWD });
	});
});

describe("runTask — lint aggregate", () => {
	const onPath =
		(...bins: string[]) =>
		(_cwd: string, bin: string) =>
			bins.includes(bin) ? `/usr/local/bin/${bin}` : null;

	it("runs `turbo run lint` for the eslint slot + the other linters natively", () => {
		const { call, exec, lines } = makeRun(
			{ "package.json": PKG(), "turbo.json": JSON.stringify({ tasks: { lint: {} } }), "eslint.config.ts": "" },
			{ lookPath: onPath("prettier") }
		);
		const report = call("lint");
		expect(report.status).toBe("ok");
		expect(exec).toHaveBeenCalledWith("turbo", ["run", "lint"], { cwd: CWD });
		expect(exec).toHaveBeenCalledWith("/usr/local/bin/prettier", ["--check", "."], { cwd: CWD });
		expect(lines.join("\n")).toMatch(/! actionlint — actionlint not on PATH\. brew install actionlint/);
		expect(lines.join("\n")).toMatch(/· git-merge-conflict-markers \(CI only\)/);
	});

	it("runs `eslint .` directly when turbo does not define lint", () => {
		const { call, exec } = makeRun(
			{ "package.json": PKG(), "eslint.config.ts": "" },
			{ lookPath: onPath("eslint") }
		);
		call("lint");
		expect(exec).toHaveBeenCalledWith("/usr/local/bin/eslint", ["."], { cwd: CWD });
	});

	it("honours an explicit linters list", () => {
		const { call, exec } = makeRun(
			{ "package.json": PKG(), "turbo.json": JSON.stringify({ tasks: { lint: {} } }) },
			{ lookPath: onPath("prettier"), linters: ["eslint", "prettier"] }
		);
		call("lint");
		expect(exec).toHaveBeenCalledWith("turbo", ["run", "lint"], { cwd: CWD });
		expect(exec).toHaveBeenCalledWith("/usr/local/bin/prettier", ["--check", "."], { cwd: CWD });
		// yamllint is always-on but excluded by the explicit list
		expect(exec).not.toHaveBeenCalledWith("/usr/local/bin/yamllint", expect.anything(), expect.anything());
	});

	it("reports fail when any linter exits non-zero (and treats an unreadable root as no config files)", () => {
		const exec = vi.fn((_c: string, _a: string[], _o: { cwd: string }) => ({ exitCode: 1 }));
		const report = runTask({
			task: "lint",
			cwd: CWD,
			print: () => {},
			logger: noopLogger,
			exec,
			readFile: () => {
				throw new Error("none");
			},
			fileExists: () => false,
			listDir: () => {
				throw new Error("EACCES");
			},
			lookPath: onPath("prettier"),
		});
		expect(report.status).toBe("fail");
		expect(report.message).toBe("one or more linters failed");
	});

	it("skips (or fails with --required) when every resolved linter is CI-only", () => {
		const base = { "package.json": PKG() };
		const skip = makeRun(base).call("lint", { linters: ["gitleaks", "git-merge-conflict-markers"] });
		expect(skip.status).toBe("skip");
		const fail = makeRun(base).call("lint", {
			linters: ["gitleaks", "git-merge-conflict-markers"],
			required: true,
		});
		expect(fail.status).toBe("fail");
	});

	it("--dry-run lists every command and runs nothing", () => {
		const { call, exec, lines } = makeRun(
			{ "package.json": PKG(), "turbo.json": JSON.stringify({ tasks: { lint: {} } }), "eslint.config.ts": "" },
			{ lookPath: onPath("prettier") }
		);
		const report = call("lint", { dryRun: true });
		expect(report.status).toBe("dry-run");
		expect(exec).not.toHaveBeenCalled();
		expect(lines.join("\n")).toMatch(/would run: .*turbo run lint/);
		expect(lines.join("\n")).toMatch(/would run: .*prettier --check \./);
	});

	it("forwards passthrough to turbo (with --) and to each linter (raw)", () => {
		const { call, exec } = makeRun(
			{ "package.json": PKG(), "turbo.json": JSON.stringify({ tasks: { lint: {} } }), "eslint.config.ts": "" },
			{ lookPath: onPath("prettier") }
		);
		call("lint", { passthrough: ["--cache"] });
		expect(exec).toHaveBeenCalledWith("turbo", ["run", "lint", "--", "--cache"], {
			cwd: CWD,
		});
		expect(exec).toHaveBeenCalledWith("/usr/local/bin/prettier", ["--check", ".", "--cache"], { cwd: CWD });
	});

	it("forwards --filter to turbo for the eslint slot", () => {
		const { call, exec } = makeRun(
			{ "package.json": PKG(), "turbo.json": JSON.stringify({ tasks: { lint: {} } }), "eslint.config.ts": "" },
			{ lookPath: onPath("prettier") }
		);
		call("lint", { filter: "@scope/cli" });
		expect(exec).toHaveBeenCalledWith("turbo", ["run", "lint", "--filter=@scope/cli"], { cwd: CWD });
	});

	it("an explicit non-holocron `lint` script fills the eslint slot", () => {
		const { call, exec } = makeRun(
			{ "package.json": PKG({ scripts: { lint: "biome check" } }), "eslint.config.ts": "" },
			{ lookPath: onPath("eslint", "prettier") }
		);
		call("lint");
		expect(exec).toHaveBeenCalledWith("pnpm", ["run", "lint"], { cwd: CWD });
		expect(exec).not.toHaveBeenCalledWith("/usr/local/bin/eslint", ["."], { cwd: CWD });
	});
});
