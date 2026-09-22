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
	it("delegates to turbo at a monorepo root, forwarding the org-default flags", () => {
		const { call, exec } = makeRun({
			"package.json": PKG(),
			"turbo.json": JSON.stringify({ tasks: { "verification.unitTests": {}, "delivery.build": {} } }),
			"pnpm-lock.yaml": "",
		});
		const report = call("verification.unitTests");
		expect(report.status).toBe("ok");
		// `verification.unitTests` carries `flags: { vitest: ["--coverage"] }` —
		// forwarded through `--` so `holocron run verification.unitTests` at a
		// turbo root still produces coverage.
		expect(exec).toHaveBeenCalledWith(
			expect.stringMatching(/turbo$/),
			["run", "verification.unitTests", "--", "--coverage"],
			{ cwd: CWD }
		);
	});

	it("delegates a flag-less task to turbo with no trailing --", () => {
		const { call, exec } = makeRun({
			"package.json": PKG(),
			"turbo.json": JSON.stringify({ tasks: { "verification.typeSafety": {} } }),
		});
		call("verification.typeSafety");
		expect(exec).toHaveBeenCalledWith(expect.stringMatching(/turbo$/), ["run", "verification.typeSafety"], {
			cwd: CWD,
		});
	});

	it("forwards passthrough args to turbo after the org-default flags", () => {
		const { call, exec } = makeRun({
			"package.json": PKG(),
			"turbo.json": JSON.stringify({ tasks: { "verification.unitTests": {} } }),
		});
		call("verification.unitTests", { passthrough: ["--filter", "@scope/x"] });
		expect(exec).toHaveBeenCalledWith(
			expect.any(String),
			["run", "verification.unitTests", "--", "--coverage", "--filter", "@scope/x"],
			{ cwd: CWD }
		);
	});

	it("runs the registry tool with org-default flags", () => {
		const { call, exec } = makeRun({
			"package.json": PKG(),
			"node_modules/.bin/vitest": "#!/bin/sh",
		});
		call("verification.unitTests");
		expect(exec).toHaveBeenCalledWith(join(CWD, "node_modules/.bin/vitest"), ["run", "--coverage"], { cwd: CWD });
	});

	it("resolves the build tool from a detect[] match", () => {
		const { call, exec } = makeRun({ "package.json": PKG(), "tsdown.config.ts": "" });
		call("delivery.build");
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
		call("delivery.build");
		expect(exec).toHaveBeenCalledWith("tsdown", [], { cwd: CWD });
	});

	it("doesn't let tsconfig.json's own fallback rule win over an earlier candidate's dependency match, just because tsconfig.json always exists (regression)", () => {
		// The real bug this caught: delivery.build's detect[] ends with
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
		call("delivery.build");
		expect(exec).toHaveBeenCalledWith("tsdown", [], { cwd: CWD });
	});

	it("checks dependencies too, not just devDependencies, for the fallback", () => {
		const { call, exec } = makeRun({
			"package.json": PKG({ dependencies: { vite: "^7.0.0" } }),
		});
		call("delivery.build");
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
		call("delivery.build");
		expect(exec).toHaveBeenCalledWith("tsdown", [], { cwd: CWD });
	});

	it("reports no local delivery.build runner when neither a config file nor a known dependency exists", () => {
		const { call } = makeRun({ "package.json": PKG() });
		const report = call("delivery.build");
		expect(report).toEqual({ status: "skip", message: "no delivery.build task for this repo" });
	});

	it("still reports no runner when package.json itself is missing (dependency fallback degrades gracefully)", () => {
		const { call } = makeRun({});
		const report = call("delivery.build");
		expect(report).toEqual({ status: "skip", message: "no delivery.build task for this repo" });
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
		call("verification.unitTests");
		expect(exec).toHaveBeenCalledWith(
			join(CWD, "node_modules/.bin/vitest"),
			[
				"run",
				"--config",
				join(CWD, "node_modules/@theholocron/vitest-config/dist/bundles/library.js"),
				"--coverage",
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
		call("delivery.build");
		expect(exec).toHaveBeenCalledWith("tsdown", [], { cwd: CWD });
	});

	it("adds no --config flag when the shared config package isn't installed — falls back to auto-discovery", () => {
		const { call, exec } = makeRun({ "package.json": PKG(), "node_modules/.bin/vitest": "#!/bin/sh" });
		call("verification.unitTests");
		expect(exec).toHaveBeenCalledWith(join(CWD, "node_modules/.bin/vitest"), ["run", "--coverage"], { cwd: CWD });
	});

	it("prefers vite when vite.config is present", () => {
		const { call, exec } = makeRun({ "package.json": PKG(), "vite.config.ts": "" });
		call("delivery.build");
		expect(exec).toHaveBeenCalledWith("vite", ["build"], { cwd: CWD });
	});

	it("an explicit package.json script wins over the registry default", () => {
		const { call, exec } = makeRun({
			"package.json": PKG({ scripts: { "delivery.build": "make" }, packageManager: "pnpm@10.0.0" }),
			"tsdown.config.ts": "", // registry would pick tsdown — the script overrides
		});
		const report = call("delivery.build");
		expect(report.status).toBe("ok");
		expect(exec).toHaveBeenCalledWith("pnpm", ["run", "delivery.build"], { cwd: CWD });
	});

	it("ignores a `holocron run` thin-caller script and uses the registry (no recursion)", () => {
		const { call, exec } = makeRun({
			"package.json": PKG({ scripts: { "verification.unitTests": "holocron run verification.unitTests" } }),
			"node_modules/.bin/vitest": "",
		});
		call("verification.unitTests");
		expect(exec).toHaveBeenCalledWith(join(CWD, "node_modules/.bin/vitest"), ["run", "--coverage"], { cwd: CWD });
	});

	it("forwards `-- <passthrough>` to a package.json script", () => {
		const { call, exec } = makeRun({
			"package.json": PKG({ scripts: { "verification.unitTests": "vitest" } }),
			"pnpm-lock.yaml": "",
		});
		call("verification.unitTests", { passthrough: ["--watch"] });
		expect(exec).toHaveBeenCalledWith("pnpm", ["run", "verification.unitTests", "--", "--watch"], { cwd: CWD });
	});

	it("resolves a registry task with no package.json at all", () => {
		const { call, exec } = makeRun({ "node_modules/.bin/tsc": "" });
		const report = call("verification.typeSafety");
		expect(report.status).toBe("ok");
		expect(exec).toHaveBeenCalledWith(join(CWD, "node_modules/.bin/tsc"), ["--noEmit"], { cwd: CWD });
	});

	it("detects the package manager from the lockfile when packageManager is absent", () => {
		const { call, exec } = makeRun({
			"package.json": PKG({ scripts: { "verification.typeSafety": "tsc -p ." } }),
			"bun.lockb": "",
		});
		call("verification.typeSafety");
		expect(exec).toHaveBeenCalledWith("bun", ["run", "verification.typeSafety"], { cwd: CWD });
	});

	it("defaults the package manager to pnpm with no field and no lockfile", () => {
		const { call, exec } = makeRun({ "package.json": PKG({ scripts: { "verification.typeSafety": "tsc -p ." } }) });
		call("verification.typeSafety");
		expect(exec).toHaveBeenCalledWith("pnpm", ["run", "verification.typeSafety"], { cwd: CWD });
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
		const report = call("delivery.build");
		expect(report.status).toBe("skip");
		expect(exec).not.toHaveBeenCalled();
	});

	it("skips (exit 0) a known task the repo can't run", () => {
		const { call, exec, lines } = makeRun({ "package.json": PKG() }); // no build tooling, no script
		const report = call("delivery.build");
		expect(report.status).toBe("skip");
		expect(exec).not.toHaveBeenCalled();
		expect(lines.join("\n")).toContain("no delivery.build task for this repo");
	});

	it("fails (exit 1) on a can't-run known task when --required", () => {
		const { call } = makeRun({ "package.json": PKG() });
		const report = call("delivery.build", { required: true });
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
		const report = call("verification.typeSafety");
		expect(report.status).toBe("fail");
		expect(report.message).toMatch(/exited 2/);
	});

	it("invokes the CLI itself for a task backed by a holocron subcommand", () => {
		const { call, exec } = makeRun({ "package.json": PKG() });
		call("platform.repoSync", { passthrough: ["--steps", "readme"] });
		expect(exec).toHaveBeenCalledWith(process.execPath, [process.argv[1], "sync", "--steps", "readme"], {
			cwd: CWD,
		});
	});

	it("reports a task with no local equivalent as skipped — even when --required", () => {
		const { call, exec, lines } = makeRun({ "package.json": PKG() });
		const report = call("security.codeScanning", { required: true });
		expect(report.status).toBe("skip");
		expect(report.message).toMatch(/enforced in CI/);
		expect(lines.join("\n")).not.toContain("✗");
		expect(exec).not.toHaveBeenCalled();
	});

	it("still runs an explicit package.json script for a local:null task", () => {
		const { call, exec } = makeRun({ "package.json": PKG({ scripts: { "security.codeScanning": "some-scan" } }) });
		const report = call("security.codeScanning", { required: true });
		expect(report.status).toBe("ok");
		expect(exec).toHaveBeenCalledWith(expect.stringMatching(/pnpm$/), ["run", "security.codeScanning"], {
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
		const report = call("verification.typeSafety");
		expect(report.status).toBe("ok");
		expect(exec).toHaveBeenCalledWith(join(CWD, "node_modules/.bin/tsc"), ["--noEmit"], { cwd: CWD });
	});

	it("--dry-run prints the resolved command and runs nothing", () => {
		const { call, exec, lines } = makeRun({
			"package.json": PKG(),
			"turbo.json": JSON.stringify({ pipeline: { "verification.unitTests": {} } }),
		});
		const report = call("verification.unitTests", { dryRun: true });
		expect(report.status).toBe("dry-run");
		expect(exec).not.toHaveBeenCalled();
		expect(lines.join("\n")).toMatch(/would run: .*turbo run verification\.unitTests/);
	});
});

describe("runTask — sub-jobs", () => {
	const onPath =
		(...bins: string[]) =>
		(_cwd: string, bin: string): string | null =>
			bins.includes(bin) ? `/usr/local/bin/${bin}` : null;

	it("runs one named job — `platform.repoValidation registry` → node scripts/validate-registry.mjs", () => {
		const { call, exec } = makeRun({ "package.json": PKG() }, { lookPath: onPath("node") });
		const report = call("platform.repoValidation", { job: "registry" });
		expect(report.status).toBe("ok");
		expect(exec).toHaveBeenCalledWith("/usr/local/bin/node", ["scripts/validate-registry.mjs"], { cwd: CWD });
	});

	it("forwards passthrough args to the job's tool", () => {
		const { call, exec } = makeRun({ "package.json": PKG() }, { lookPath: onPath("node") });
		call("platform.repoValidation", { job: "registry", passthrough: ["--strict"] });
		expect(exec).toHaveBeenCalledWith("/usr/local/bin/node", ["scripts/validate-registry.mjs", "--strict"], {
			cwd: CWD,
		});
	});

	it("skips a job whose tool isn't installed locally — enforced in CI", () => {
		const { call, exec, lines } = makeRun({ "package.json": PKG() }); // nothing on PATH
		const report = call("platform.repoValidation", { job: "registry" });
		expect(report.status).toBe("skip");
		expect(exec).not.toHaveBeenCalled();
		expect(lines.join("\n")).toMatch(/node not installed locally.*enforced in CI/);
	});

	it("--required turns a missing job tool into a failure", () => {
		const { call } = makeRun({ "package.json": PKG() });
		const report = call("platform.repoValidation", { job: "registry", required: true });
		expect(report.status).toBe("fail");
	});

	it("rejects an unknown job with the known list, exit 1", () => {
		const { call, lines } = makeRun({ "package.json": PKG() });
		const report = call("platform.repoValidation", { job: "frobnicate" });
		expect(report.status).toBe("unknown");
		expect(report.message).toBe('unknown job "platform.repoValidation frobnicate"');
		expect(lines.join("\n")).toMatch(/known: adrs, registry, docsPresence/);
	});

	it("`holocron run platform.repoValidation` with no job runs every job in declared order", () => {
		const { call, exec, lines } = makeRun({ "package.json": PKG() }, { lookPath: onPath("node") });
		const report = call("platform.repoValidation");
		expect(report.status).toBe("ok");
		expect(exec.mock.calls.map((c) => c[1])).toEqual([
			["scripts/validate-adrs.mjs"],
			["scripts/validate-registry.mjs"],
			["scripts/validate-docs-presence.mjs"],
		]);
		const out = lines.join("\n");
		expect(out.indexOf("platform.repoValidation / Validate ADRs and specs")).toBeLessThan(
			out.indexOf("platform.repoValidation / Validate registry consistency")
		);
		expect(out.indexOf("platform.repoValidation / Validate registry consistency")).toBeLessThan(
			out.indexOf("platform.repoValidation / Validate docs presence")
		);
	});

	it("`holocron run platform.repoValidation --dry-run` plans every job and runs nothing", () => {
		const { call, exec, lines } = makeRun({ "package.json": PKG() }, { lookPath: onPath("node") });
		const report = call("platform.repoValidation", { dryRun: true });
		expect(report.status).toBe("dry-run");
		expect(exec).not.toHaveBeenCalled();
		expect(lines.join("\n")).toMatch(/would run: .*validate-adrs\.mjs[\s\S]*would run: .*validate-registry\.mjs/);
	});

	it("`holocron run platform.repoValidation` is a clean skip when no job is runnable locally", () => {
		const { call, exec } = makeRun({ "package.json": PKG() });
		const report = call("platform.repoValidation");
		expect(report.status).toBe("skip");
		expect(exec).not.toHaveBeenCalled();
		expect(report.message).toMatch(/no platform.repoValidation job has a local equivalent/);
	});

	it("`holocron run platform.repoValidation` fails the run when one job fails", () => {
		const { call } = makeRun(
			{ "package.json": PKG() },
			{ lookPath: onPath("node"), exec: () => ({ exitCode: 1 }) }
		);
		const report = call("platform.repoValidation");
		expect(report.status).toBe("fail");
		expect(report.message).toMatch(/one or more platform.repoValidation jobs failed/);
	});

	it("folds a job-position arg into passthrough for a task with no jobs (`delivery.build src/`)", () => {
		const { call, exec } = makeRun({
			"package.json": PKG(),
			"tsdown.config.ts": "",
			"node_modules/.bin/tsdown": "",
		});
		call("delivery.build", { job: "src/" });
		expect(exec).toHaveBeenCalledWith(join(CWD, "node_modules/.bin/tsdown"), ["src/"], { cwd: CWD });
	});

	it("an explicit script still wins over job expansion", () => {
		const { call, exec } = makeRun({
			"package.json": PKG({ scripts: { "platform.repoValidation": "node scripts/validate-all.mjs" } }),
		});
		const report = call("platform.repoValidation");
		expect(report.status).toBe("ok");
		expect(exec).toHaveBeenCalledWith(expect.stringMatching(/pnpm$/), ["run", "platform.repoValidation"], {
			cwd: CWD,
		});
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
				"turbo.json": JSON.stringify({ tasks: { "sourceQuality.staticAnalysis": {} } }),
				"eslint.config.ts": "",
			},
			{ lookPath: onPath("eslint") }
		);
		const report = call("sourceQuality.staticAnalysis");
		expect(report.status).toBe("ok");
		expect(exec).toHaveBeenCalledWith(expect.stringMatching(/turbo$/), ["run", "sourceQuality.staticAnalysis"], {
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
		const report = call("sourceQuality.staticAnalysis");
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
		call("sourceQuality.staticAnalysis");
		expect(exec).toHaveBeenCalledWith("/usr/local/bin/eslint", ["."], { cwd: CWD });
	});

	it("adds --config <resolved shared path> for a legacy .eslintrc.json repo with no flat eslint.config.* yet", () => {
		// .eslintrc.json satisfies linters.ts's own detect[] gate (so eslint
		// still runs in the group) but isn't one of resolver.ts's flat-config
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
		call("sourceQuality.staticAnalysis");
		expect(exec).toHaveBeenCalledWith(
			"/usr/local/bin/eslint",
			["--config", join(CWD, "node_modules/@theholocron/eslint-config/dist/bundles/library.js"), "."],
			{ cwd: CWD }
		);
	});

	it("an explicit package.json script for the task wins over per-linter native execution", () => {
		const { call, exec } = makeRun({
			"package.json": PKG({ scripts: { "sourceQuality.staticAnalysis": "biome check" } }),
			"eslint.config.ts": "",
		});
		call("sourceQuality.staticAnalysis");
		expect(exec).toHaveBeenCalledWith(expect.stringMatching(/pnpm$/), ["run", "sourceQuality.staticAnalysis"], {
			cwd: CWD,
		});
	});

	it("eslint is skipped (not run) without a config file — no config, no candidate", () => {
		const { call, exec } = makeRun({ "package.json": PKG() }, { lookPath: onPath("eslint") });
		call("sourceQuality.staticAnalysis");
		expect(exec).not.toHaveBeenCalledWith("/usr/local/bin/eslint", ["."], { cwd: CWD });
	});

	it("reports fail when any linter exits non-zero (and treats an unreadable root as no config files)", () => {
		const exec = vi.fn((_c: string, _a: string[], _o: { cwd: string }) => ({ exitCode: 1 }));
		const report = runTask({
			task: "security.secretDetection",
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
		const skip = makeRun(base).call("platform.commitStandards");
		expect(skip.status).toBe("skip");
		const stillSkip = makeRun(base).call("platform.commitStandards", { required: true });
		expect(stillSkip.status).toBe("skip");
	});

	it("fails when required and a linter with a real localBin just isn't installed", () => {
		// gitleaks has a localBin — this is an actionable "go install it" gap,
		// not a structurally CI-only task, so --required does fail it.
		const base = { "package.json": PKG() };
		const skip = makeRun(base).call("security.secretDetection");
		expect(skip.status).toBe("skip");
		const fail = makeRun(base).call("security.secretDetection", { required: true });
		expect(fail.status).toBe("fail");
	});

	it("--dry-run lists every command and runs nothing", () => {
		const { call, exec, lines } = makeRun({ "package.json": PKG() }, { lookPath: onPath("gitleaks") });
		const report = call("security.secretDetection", { dryRun: true });
		expect(report.status).toBe("dry-run");
		expect(exec).not.toHaveBeenCalled();
		expect(lines.join("\n")).toMatch(/would run: .*gitleaks/);
	});

	it("forwards passthrough to each linter", () => {
		const { call, exec } = makeRun({ "package.json": PKG() }, { lookPath: onPath("gitleaks") });
		call("security.secretDetection", { passthrough: ["--verbose"] });
		expect(exec.mock.calls[0]![1]).toContain("--verbose");
	});
});
