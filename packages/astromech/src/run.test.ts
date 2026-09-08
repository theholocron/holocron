import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

const spawnSync = vi.fn(() => ({ status: 0 }));
vi.mock("node:child_process", () => ({ spawnSync: (...a: unknown[]) => spawnSync(...(a as [])) }));

import { runTask, type RunTaskInput } from "./run.js";

const CWD = "/repo";

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
	const call = (task: string, extra: Partial<RunTaskInput> = {}) =>
		runTask({
			task,
			cwd: CWD,
			print: (l) => lines.push(l),
			exec,
			readFile: fs.readFile,
			fileExists: fs.fileExists,
			listDir: fs.listDir,
			...overrides,
			...extra,
		});
	return { call, exec, lines };
}

const PKG = (extra: Record<string, unknown> = {}) => JSON.stringify({ name: "@scope/x", ...extra });

afterEach(() => spawnSync.mockClear());

describe("runTask", () => {
	it("defaults to spawnSync (stdio inherit) when no exec is injected", () => {
		const fs = makeFs({ "package.json": PKG(), "node_modules/.bin/eslint": "" });
		const report = runTask({
			task: "lint",
			cwd: CWD,
			print: () => {},
			readFile: fs.readFile,
			fileExists: fs.fileExists,
			listDir: fs.listDir,
		});
		expect(report.status).toBe("ok");
		expect(spawnSync).toHaveBeenCalledWith(join(CWD, "node_modules/.bin/eslint"), ["."], {
			cwd: CWD,
			stdio: "inherit",
		});
	});

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

	it("detects the package manager from the lockfile when packageManager is absent", () => {
		const { call, exec } = makeRun({
			"package.json": PKG({ scripts: { lint: "biome check" } }),
			"bun.lockb": "",
		});
		call("lint");
		expect(exec).toHaveBeenCalledWith("bun", ["run", "lint"], { cwd: CWD });
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

	it("reports a task with no local equivalent as skipped", () => {
		const { call, exec } = makeRun({ "package.json": PKG() });
		const report = call("codeql");
		expect(report.status).toBe("skip");
		expect(exec).not.toHaveBeenCalled();
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
			"node_modules/.bin/eslint": "",
		});
		const report = call("lint");
		expect(report.status).toBe("ok");
		expect(exec).toHaveBeenCalledWith(join(CWD, "node_modules/.bin/eslint"), ["."], { cwd: CWD });
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
