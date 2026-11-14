import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { noopLogger } from "../../utils/index.js";
import { runTask } from "./run.js";
import type { RunTaskInput } from "./run.type.js";

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
	it("delegates to turbo at a monorepo root and forwards nothing to a flat-named task", () => {
		const { call, exec } = makeRun({
			"package.json": PKG(),
			"turbo.json": JSON.stringify({ tasks: { "test:unit": {}, build: {} } }),
			"pnpm-lock.yaml": "",
		});
		const report = call("test:unit");
		expect(report.status).toBe("ok");
		// The flat-named package script carries the coverage flag itself.
		expect(exec).toHaveBeenCalledWith(expect.stringMatching(/turbo$/), ["run", "test:unit"], { cwd: CWD });
	});

	it("delegates a flag-less task to turbo with no trailing --", () => {
		const { call, exec } = makeRun({
			"package.json": PKG(),
			"turbo.json": JSON.stringify({ tasks: { typecheck: {} } }),
		});
		call("typecheck");
		expect(exec).toHaveBeenCalledWith(expect.stringMatching(/turbo$/), ["run", "typecheck"], {
			cwd: CWD,
		});
	});

	it("forwards passthrough args to turbo after the task name", () => {
		const { call, exec } = makeRun({
			"package.json": PKG(),
			"turbo.json": JSON.stringify({ tasks: { "test:unit": {} } }),
		});
		call("test:unit", { passthrough: ["--filter", "@scope/x"] });
		expect(exec).toHaveBeenCalledWith(expect.any(String), ["run", "test:unit", "--", "--filter", "@scope/x"], {
			cwd: CWD,
		});
	});

	describe("--affected", () => {
		const TURBO_FILES = {
			"package.json": PKG(),
			"turbo.json": JSON.stringify({ tasks: { typecheck: {} } }),
		};

		it("adds --affected to turbo and hands it the base through TURBO_SCM_BASE", () => {
			const { call, exec } = makeRun(TURBO_FILES);
			call("typecheck", { affected: true, base: "abc123" });
			expect(exec).toHaveBeenCalledWith(expect.stringMatching(/turbo$/), ["run", "typecheck", "--affected"], {
				cwd: CWD,
				env: { TURBO_SCM_BASE: "abc123" },
			});
		});

		it("combines with --filter, in front of the passthrough", () => {
			const { call, exec } = makeRun(TURBO_FILES);
			call("typecheck", {
				affected: true,
				base: "abc",
				filter: "@scope/x",
				passthrough: ["--force"],
			});
			expect(exec).toHaveBeenCalledWith(
				expect.any(String),
				["run", "typecheck", "--filter=@scope/x", "--affected", "--", "--force"],
				{ cwd: CWD, env: { TURBO_SCM_BASE: "abc" } }
			);
		});

		it("runs everything and says why when the base is missing", () => {
			const { call, exec, lines } = makeRun(TURBO_FILES);
			call("typecheck", { affected: true });
			expect(exec).toHaveBeenCalledWith(expect.any(String), ["run", "typecheck"], { cwd: CWD });
			expect(lines.join("\n")).toMatch(/--affected ignored: no base/);
		});

		it("says so when the repo has no turbo task to apply it to", () => {
			const { call, lines } = makeRun({ "package.json": PKG({ scripts: { typecheck: "tsc" } }) });
			call("typecheck", { affected: true, base: "abc" });
			expect(lines.join("\n")).toMatch(/--affected ignored: this repo has no turbo task/);
		});
	});

	it("runs the registry tool with coverage built into its command", () => {
		const { call, exec } = makeRun({
			"package.json": PKG(),
			"node_modules/.bin/vitest": "#!/bin/sh",
		});
		call("test:unit");
		expect(exec).toHaveBeenCalledWith(join(CWD, "node_modules/.bin/vitest"), ["run", "--coverage"], { cwd: CWD });
	});

	it("runs the registry itself, not the root script generated from it, so a missing tool is a note", () => {
		const { call, exec, lines } = makeRun({
			"package.json": PKG({ scripts: { "lint:editorconfig": "editorconfig-checker" } }),
		});
		call("lint:editorconfig");
		expect(exec).not.toHaveBeenCalled();
		expect(lines.join("\n")).toMatch(/editorconfig-checker not on PATH/);
	});

	it("still runs a root script of the same name that is the repo's own command", () => {
		const { call, exec } = makeRun({
			"package.json": PKG({
				scripts: { "lint:editorconfig": "editorconfig-checker docs" },
				packageManager: "pnpm@10.0.0",
			}),
		});
		call("lint:editorconfig");
		expect(exec).toHaveBeenCalledWith("pnpm", ["run", "lint:editorconfig"], { cwd: CWD });
	});

	it("resolves the build tool from a detect[] match", () => {
		const { call, exec } = makeRun({ "package.json": PKG(), "tsdown.config.ts": "" });
		call("build");
		expect(exec).toHaveBeenCalledWith("tsdown", [], { cwd: CWD });
	});

	it("falls back to package.json's devDependencies when no detect[] config file exists (#750)", () => {
		// tsdown.config.ts deleted (the Bucket A migration this was blocking,
		// #680) -- detect[] has no filename to match on at all, but the
		// package still genuinely builds with tsdown, and that's still true
		// without its config file.
		const { call, exec } = makeRun({
			"package.json": PKG({ devDependencies: { tsdown: "^0.22.0" } }),
		});
		call("build");
		expect(exec).toHaveBeenCalledWith("tsdown", [], { cwd: CWD });
	});

	it("doesn't let tsconfig.json's own fallback rule win over an earlier candidate's dependency match, just because tsconfig.json always exists (regression)", () => {
		// The real bug this caught: build's detect[] ends with
		// { when: /^tsconfig\.json$/, tool: "tsc" } as its last-resort
		// fallback -- and tsconfig.json exists in essentially every real
		// package regardless of build tool. A "check every candidate's
		// filename in one pass, then every candidate's dependency in a
		// second pass" design would hit tsconfig.json's filename match in
		// the first pass before ever reaching tsdown's dependency check in
		// the second -- silently resolving to `tsc -b` instead of `tsdown`
		// the moment a Bucket A migration (#680) deleted tsdown.config.ts
		// from a real repo. Caught live in clients (#762) immediately after
		// #750 shipped, with real package.json fixtures always carrying a
		// tsconfig.json alongside them -- the earlier fixtures in this file
		// never included one, so this never failed here first.
		const { call, exec } = makeRun({
			"package.json": PKG({ devDependencies: { tsdown: "^0.22.0" } }),
			"tsconfig.json": "{}",
		});
		call("build");
		expect(exec).toHaveBeenCalledWith("tsdown", [], { cwd: CWD });
	});

	it("checks dependencies too, not just devDependencies, for the fallback", () => {
		const { call, exec } = makeRun({
			"package.json": PKG({ dependencies: { vite: "^7.0.0" } }),
		});
		call("build");
		expect(exec).toHaveBeenCalledWith("vite", ["build"], { cwd: CWD });
	});

	it("an earlier candidate's dependency match wins over a later candidate's file match", () => {
		// Deliberately conflicting signals: rollup.config.ts on disk (a real
		// file, for the 3rd detect[] candidate), but tsdown -- the 1st
		// candidate -- still listed in devDependencies too (e.g. a
		// mid-migration repo that added rollup.config.ts but hasn't cleaned
		// up the old devDependency yet). detect[]'s declared order is the
		// tie-breaker: tsdown's dependency signal is checked, and matches,
		// before rollup's file signal is ever reached.
		const { call, exec } = makeRun({
			"package.json": PKG({ devDependencies: { tsdown: "^0.22.0" } }),
			"rollup.config.ts": "",
		});
		call("build");
		expect(exec).toHaveBeenCalledWith("tsdown", [], { cwd: CWD });
	});

	it("reports no local build runner when neither a config file nor a known dependency exists", () => {
		const { call } = makeRun({ "package.json": PKG() });
		const report = call("build");
		expect(report).toEqual({ status: "skip", message: "no build task for this repo" });
	});

	it("still reports no runner when package.json itself is missing (dependency fallback degrades gracefully)", () => {
		const { call } = makeRun({});
		const report = call("build");
		expect(report).toEqual({ status: "skip", message: "no build task for this repo" });
	});

	it("adds --config <resolved shared path> when the tool's shared config package is installed (vitest)", () => {
		const { call, exec } = makeRun({
			"package.json": PKG(),
			"node_modules/.bin/vitest": "#!/bin/sh",
			"node_modules/@theholocron/vitest-config/package.json": JSON.stringify({
				exports: { "./bundles/library": { import: "./dist/bundles/library.js" } },
			}),
			"node_modules/@theholocron/vitest-config/dist/bundles/library.js": "export default {};",
		});
		call("test:unit");
		expect(exec).toHaveBeenCalledWith(
			join(CWD, "node_modules/.bin/vitest"),
			[
				"run",
				"--coverage",
				"--config",
				join(CWD, "node_modules/@theholocron/vitest-config/dist/bundles/library.js"),
			],
			{ cwd: CWD }
		);
	});

	it("skips --config for a detect[] runner when the local config file it detected off of still wins (tsdown, #749)", () => {
		// tsdown.config.ts is both what `detect[]` matched to pick "tsdown" as
		// the tool *and* the local file `resolveToolConfig` now defers to
		// (#749) — the shared package being installed too doesn't force
		// --config over it; tsdown's own auto-discovery of tsdown.config.ts
		// takes over instead, unchanged from pre-resolver behavior.
		const { call, exec } = makeRun({
			"package.json": PKG(),
			"tsdown.config.ts": "",
			"node_modules/@theholocron/tsdown-config/package.json": JSON.stringify({
				exports: { "./presets/library": { import: "./dist/presets/library.js" } },
			}),
			"node_modules/@theholocron/tsdown-config/dist/presets/library.js": "export default {};",
		});
		call("build");
		expect(exec).toHaveBeenCalledWith("tsdown", [], { cwd: CWD });
	});

	it("adds no --config flag when the shared config package isn't installed — falls back to auto-discovery", () => {
		const { call, exec } = makeRun({ "package.json": PKG(), "node_modules/.bin/vitest": "#!/bin/sh" });
		call("test:unit");
		expect(exec).toHaveBeenCalledWith(join(CWD, "node_modules/.bin/vitest"), ["run", "--coverage"], { cwd: CWD });
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
			"package.json": PKG({ scripts: { "test:unit": "holocron run test:unit" } }),
			"node_modules/.bin/vitest": "",
		});
		call("test:unit");
		expect(exec).toHaveBeenCalledWith(join(CWD, "node_modules/.bin/vitest"), ["run", "--coverage"], { cwd: CWD });
	});

	it("forwards `-- <passthrough>` to a package.json script", () => {
		const { call, exec } = makeRun({
			"package.json": PKG({ scripts: { "test:unit": "vitest" } }),
			"pnpm-lock.yaml": "",
		});
		call("test:unit", { passthrough: ["--watch"] });
		expect(exec).toHaveBeenCalledWith("pnpm", ["run", "test:unit", "--", "--watch"], { cwd: CWD });
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
		call("sync-repo", { passthrough: ["--steps", "readme"] });
		expect(exec).toHaveBeenCalledWith(process.execPath, [process.argv[1], "sync", "--steps", "readme"], {
			cwd: CWD,
		});
	});

	it("splits a multi-word holocron subcommand into separate argv entries, not one string with a space", () => {
		const { call, exec } = makeRun({ "package.json": PKG() });
		call("sync-templates");
		// "sync github" is a nested yargs command path — must be two tokens,
		// not one string containing a space, or yargs can't resolve it.
		expect(exec).toHaveBeenCalledWith(process.execPath, [process.argv[1], "sync", "github"], { cwd: CWD });
	});

	it("runs `holocron doctor secrets --verify` for check-tokens, as three argv entries", () => {
		const { call, exec } = makeRun({ "package.json": PKG() });
		call("check-tokens");
		expect(exec).toHaveBeenCalledWith(process.execPath, [process.argv[1], "doctor", "secrets", "--verify"], {
			cwd: CWD,
		});
	});

	it("runs `holocron doctor tokens` for doctor-tokens, as two argv entries", () => {
		const { call, exec } = makeRun({ "package.json": PKG() });
		call("doctor-tokens");
		expect(exec).toHaveBeenCalledWith(process.execPath, [process.argv[1], "doctor", "tokens"], { cwd: CWD });
	});

	it("runs `holocron reconcile project` for reconcile-projects, as two argv entries", () => {
		const { call, exec } = makeRun({ "package.json": PKG() });
		call("reconcile-projects");
		expect(exec).toHaveBeenCalledWith(process.execPath, [process.argv[1], "reconcile", "project"], { cwd: CWD });
	});

	it("reports a task with no local equivalent as skipped — even when --required", () => {
		const { call, exec, lines } = makeRun({ "package.json": PKG() });
		const report = call("scan:code", { required: true });
		expect(report.status).toBe("skip");
		expect(report.message).toMatch(/enforced in CI/);
		expect(lines.join("\n")).not.toContain("✗");
		expect(exec).not.toHaveBeenCalled();
	});

	it("still runs an explicit package.json script for a local:null task", () => {
		const { call, exec } = makeRun({ "package.json": PKG({ scripts: { "scan:code": "some-scan" } }) });
		const report = call("scan:code", { required: true });
		expect(report.status).toBe("ok");
		expect(exec).toHaveBeenCalledWith(expect.stringMatching(/pnpm$/), ["run", "scan:code"], {
			cwd: CWD,
		});
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
			"turbo.json": JSON.stringify({ pipeline: { "test:unit": {} } }),
		});
		const report = call("test:unit", { dryRun: true });
		expect(report.status).toBe("dry-run");
		expect(exec).not.toHaveBeenCalled();
		expect(lines.join("\n")).toMatch(/would run: .*turbo run test:unit/);
	});
});

describe("runTask — the validate leaves", () => {
	const specs = [process.argv[1], "probe", "specs", "check"];
	const docs = [process.argv[1], "probe", "docs", "validate"];

	it("`validate:specs` runs holocron probe specs check through this CLI, with no tool lookup", () => {
		const { call, exec } = makeRun({ "package.json": PKG() });
		const report = call("validate:specs");
		expect(report.status).toBe("ok");
		expect(exec).toHaveBeenCalledWith(process.execPath, specs, { cwd: CWD });
	});

	it("`validate:docs` runs holocron probe docs validate through this CLI", () => {
		const { call, exec } = makeRun({ "package.json": PKG() });
		const report = call("validate:docs");
		expect(report.status).toBe("ok");
		expect(exec).toHaveBeenCalledWith(process.execPath, docs, { cwd: CWD });
	});

	it("forwards passthrough args to the probe, so `validate:specs -- <files>` checks only those files", () => {
		const { call, exec } = makeRun({ "package.json": PKG() });
		call("validate:specs", { passthrough: [".notes/a.spec.md"] });
		expect(exec).toHaveBeenCalledWith(process.execPath, [...specs, ".notes/a.spec.md"], { cwd: CWD });
	});

	it("plans the probe on a dry run and runs nothing", () => {
		const { call, exec, lines } = makeRun({ "package.json": PKG() });
		const report = call("validate:docs", { dryRun: true });
		expect(report.status).toBe("dry-run");
		expect(exec).not.toHaveBeenCalled();
		expect(lines.join("\n")).toMatch(/would run: .*probe docs validate/);
	});

	it("fails when the probe exits non-zero", () => {
		const { call } = makeRun({ "package.json": PKG() }, { exec: () => ({ exitCode: 1 }) });
		expect(call("validate:specs").status).toBe("fail");
	});

	it("an explicit script of the leaf's name still wins over the probe", () => {
		const { call, exec } = makeRun({
			"package.json": PKG({ scripts: { "validate:specs": "node scripts/validate-specs.mjs" } }),
		});
		const report = call("validate:specs");
		expect(report.status).toBe("ok");
		expect(exec).toHaveBeenCalledWith(expect.stringMatching(/pnpm$/), ["run", "validate:specs"], { cwd: CWD });
	});

	it("a package's own `validate` script is not a task of this suite", () => {
		const { call, exec } = makeRun({ "package.json": PKG({ scripts: { validate: "node scripts/other.mjs" } }) });
		call("validate:docs");
		expect(exec).toHaveBeenCalledWith(process.execPath, docs, { cwd: CWD });
	});

	it("folds extra words into passthrough (`build src/`)", () => {
		const { call, exec } = makeRun({
			"package.json": PKG(),
			"tsdown.config.ts": "",
			"node_modules/.bin/tsdown": "",
		});
		call("build", { passthrough: ["src/"] });
		expect(exec).toHaveBeenCalledWith(join(CWD, "node_modules/.bin/tsdown"), ["src/"], { cwd: CWD });
	});
});

describe("runTask — linterGroup aggregate", () => {
	const onPath =
		(...bins: string[]) =>
		(_cwd: string, bin: string) =>
			bins.includes(bin) ? `/usr/local/bin/${bin}` : null;

	it("delegates the whole task to turbo when it defines one — not just one slot", () => {
		const { call, exec } = makeRun(
			{
				"package.json": PKG(),
				"turbo.json": JSON.stringify({ tasks: { "lint:code": {} } }),
				"eslint.config.ts": "",
			},
			{ lookPath: onPath("eslint") }
		);
		const report = call("lint:code");
		expect(report.status).toBe("ok");
		expect(exec).toHaveBeenCalledWith(expect.stringMatching(/turbo$/), ["run", "lint:code"], {
			cwd: CWD,
		});
		// turbo owns the whole task — no separate native eslint invocation
		expect(exec).not.toHaveBeenCalledWith("/usr/local/bin/eslint", ["."], { cwd: CWD });
	});

	it("runs each resolved linter in the group natively when nothing delegates the whole task", () => {
		const { call, exec, lines } = makeRun(
			{ "package.json": PKG(), "eslint.config.ts": "" },
			{ lookPath: onPath("eslint") }
		);
		const report = call("lint:code");
		expect(report.status).toBe("ok");
		expect(exec).toHaveBeenCalledWith("/usr/local/bin/eslint", ["."], { cwd: CWD });
		expect(lines.join("\n")).toMatch(/! actionlint — actionlint not on PATH\. brew install actionlint/);
		expect(lines.join("\n")).toMatch(/· git-merge-conflict-markers \(CI only\)/);
	});

	it("skips --config when the repo already has its own eslint.config.ts, even with the shared package installed (#749)", () => {
		const { call, exec } = makeRun(
			{
				"package.json": PKG(),
				"eslint.config.ts": "",
				"node_modules/@theholocron/eslint-config/package.json": JSON.stringify({
					exports: { "./bundles/library": { import: "./dist/bundles/library.js" } },
				}),
				"node_modules/@theholocron/eslint-config/dist/bundles/library.js": "export default [];",
			},
			{ lookPath: onPath("eslint") }
		);
		call("lint:code");
		expect(exec).toHaveBeenCalledWith("/usr/local/bin/eslint", ["."], { cwd: CWD });
	});

	it("adds --config <resolved shared path> for a legacy .eslintrc.json repo with no flat eslint.config.* yet", () => {
		// .eslintrc.json satisfies linters.ts's own detect[] gate (so eslint
		// still runs in the group) but isn't one of resolve-tool-config.ts's flat-config
		// filenames, so resolveToolConfig still splices the shared bundle --
		// unchanged pre-#749 behavior for a repo that hasn't migrated to flat
		// config at all yet.
		const { call, exec } = makeRun(
			{
				"package.json": PKG(),
				".eslintrc.json": "{}",
				"node_modules/@theholocron/eslint-config/package.json": JSON.stringify({
					exports: { "./bundles/library": { import: "./dist/bundles/library.js" } },
				}),
				"node_modules/@theholocron/eslint-config/dist/bundles/library.js": "export default [];",
			},
			{ lookPath: onPath("eslint") }
		);
		call("lint:code");
		expect(exec).toHaveBeenCalledWith(
			"/usr/local/bin/eslint",
			["--config", join(CWD, "node_modules/@theholocron/eslint-config/dist/bundles/library.js"), "."],
			{ cwd: CWD }
		);
	});

	it("an explicit package.json script for the task wins over per-linter native execution", () => {
		const { call, exec } = makeRun({
			"package.json": PKG({ scripts: { "lint:code": "biome check" } }),
			"eslint.config.ts": "",
		});
		call("lint:code");
		expect(exec).toHaveBeenCalledWith(expect.stringMatching(/pnpm$/), ["run", "lint:code"], {
			cwd: CWD,
		});
	});

	it("eslint is skipped (not run) without a config file — no config, no candidate", () => {
		const { call, exec } = makeRun({ "package.json": PKG() }, { lookPath: onPath("eslint") });
		call("lint:code");
		expect(exec).not.toHaveBeenCalledWith("/usr/local/bin/eslint", ["."], { cwd: CWD });
	});

	it("runs eslint via the shared config with NO local eslint.config.* at all, once the package is installed (#795)", () => {
		const { call, exec } = makeRun(
			{
				"package.json": PKG(),
				"node_modules/@theholocron/eslint-config/package.json": JSON.stringify({
					exports: { "./bundles/library": { import: "./dist/bundles/library.js" } },
				}),
				"node_modules/@theholocron/eslint-config/dist/bundles/library.js": "export default [];",
			},
			{ lookPath: onPath("eslint") }
		);
		const report = call("lint:code");
		expect(report.status).toBe("ok");
		expect(exec).toHaveBeenCalledWith(
			"/usr/local/bin/eslint",
			["--config", join(CWD, "node_modules/@theholocron/eslint-config/dist/bundles/library.js"), "."],
			{ cwd: CWD }
		);
	});

	it("reports fail when any linter exits non-zero (and treats an unreadable root as no config files)", () => {
		const exec = vi.fn((_c: string, _a: string[], _o: { cwd: string }) => ({ exitCode: 1 }));
		const report = runTask({
			task: "scan:secrets",
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
			lookPath: onPath("gitleaks"),
		});
		expect(report.status).toBe("fail");
		expect(report.message).toBe("one or more linters failed");
	});

	it("D8: a group with no local equivalent at all skips even when required (same carve-out as local: null)", () => {
		// commitlint has no localBin, ever — no PR commit range to diff
		// locally. Structurally CI-only, not "happens to be uninstalled".
		const base = { "package.json": PKG() };
		const skip = makeRun(base).call("lint:commits");
		expect(skip.status).toBe("skip");
		const stillSkip = makeRun(base).call("lint:commits", { required: true });
		expect(stillSkip.status).toBe("skip");
	});

	it("fails when required and a linter with a real localBin just isn't installed", () => {
		// gitleaks has a localBin — this is an actionable "go install it" gap,
		// not a structurally CI-only task, so --required does fail it.
		const base = { "package.json": PKG() };
		const skip = makeRun(base).call("scan:secrets");
		expect(skip.status).toBe("skip");
		const fail = makeRun(base).call("scan:secrets", { required: true });
		expect(fail.status).toBe("fail");
	});

	it("--dry-run lists every command and runs nothing", () => {
		const { call, exec, lines } = makeRun({ "package.json": PKG() }, { lookPath: onPath("gitleaks") });
		const report = call("scan:secrets", { dryRun: true });
		expect(report.status).toBe("dry-run");
		expect(exec).not.toHaveBeenCalled();
		expect(lines.join("\n")).toMatch(/would run: .*gitleaks/);
	});

	it("forwards passthrough to each linter", () => {
		const { call, exec } = makeRun({ "package.json": PKG() }, { lookPath: onPath("gitleaks") });
		call("scan:secrets", { passthrough: ["--verbose"] });
		expect(exec.mock.calls[0]![1]).toContain("--verbose");
	});
});
