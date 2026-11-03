import { describe, expect, it } from "vitest";

import { PNPM_BUILTIN_COMMANDS, RESERVED_SCRIPT_NAMES, SUITES } from "../vocabulary/index.js";
import { CI_ORDER, TASKS } from "./registry.js";

describe("TASKS registry", () => {
	it("keys are flat verb-first ids: <verb>, <verb>-<object> or <suite>:<leaf>, lowercase letters and digits", () => {
		for (const key of Object.keys(TASKS)) {
			expect(key).toMatch(/^[a-z][a-z0-9]*(-[a-z0-9]+|:[a-z0-9]+)?$/);
		}
	});

	it("a colon id is always a leaf of the suite named before the colon", () => {
		const misplaced = Object.entries(TASKS)
			.filter(([key, def]) => key.includes(":") && def.suite !== key.split(":")[0])
			.map(([key]) => key);
		expect(misplaced).toEqual([]);
	});

	it("a suite id is never also a leaf id", () => {
		expect(SUITES.filter((suite) => TASKS[suite] !== undefined)).toEqual([]);
	});

	it("declares the four suites that have leaves, in registry order", () => {
		expect(SUITES).toEqual(["test", "lint", "scan", "validate"]);
	});

	it("a colon id and a hyphen id never flatten to the same file name", () => {
		const flat = Object.keys(TASKS).map((key) => key.replace(":", "-"));
		expect(new Set(flat).size).toBe(flat.length);
	});

	it("no task is named like an npm or pnpm lifecycle word, or like another script's pre/post hook", () => {
		const ids = Object.keys(TASKS);
		const reserved = ids.filter((id) => RESERVED_SCRIPT_NAMES.has(id));
		const hooks = ids.filter((id) => ids.some((other) => id === `pre${other}` || id === `post${other}`));
		expect([...reserved, ...hooks]).toEqual([]);
	});

	it("`publish` is reserved and the release task is `release`", () => {
		expect(RESERVED_SCRIPT_NAMES.has("publish")).toBe(true);
		expect(RESERVED_SCRIPT_NAMES.has("prepare")).toBe(true);
		expect(TASKS["publish"]).toBeUndefined();
		expect(TASKS["release"]).toBeDefined();
	});

	it("`deploy` is on pnpm's built-in list, so a printed command must be `pnpm run deploy`", () => {
		expect(PNPM_BUILTIN_COMMANDS.has("deploy")).toBe(true);
		expect(PNPM_BUILTIN_COMMANDS.has("test")).toBe(false);
	});

	it("every task has an intent group and a scope", () => {
		const groups = ["Verification", "Source Quality", "Security", "Delivery", "Platform", "Knowledge"];
		const bad = Object.entries(TASKS)
			.filter(([, def]) => !groups.includes(def.group) || !["package", "repo"].includes(def.scope))
			.map(([key]) => key);
		expect(bad).toEqual([]);
	});

	it("every runner has exactly one of tool / detect / command (or local is null)", () => {
		for (const [name, { local }] of Object.entries(TASKS)) {
			if (local === null) continue;
			const forms = [local.tool, local.detect, local.command].filter((v) => v !== undefined);
			expect(forms, `${name}.local`).toHaveLength(1);
		}
	});

	it("a task that is a holocron subcommand is a probe or a plain command", () => {
		const commands = Object.entries(TASKS).flatMap(([name, def]) =>
			name.startsWith("validate:") && def.local?.command ? [[name, def.local.command]] : []
		);
		expect(commands).toEqual([
			["validate:specs", "probe specs check"],
			["validate:docs", "probe docs presence"],
		]);
	});

	it("build detects tsdown before vite before tsc", () => {
		const detect = TASKS["build"]!.local!.detect!;
		expect(detect.map((d) => d.tool)).toEqual(["tsdown", "vite", "rollup", "tsc"]);
		expect(detect[0]!.when.test("tsdown.config.ts")).toBe(true);
		expect(detect[0]!.when.test("tsdown.config.mjs")).toBe(true);
		expect(detect[1]!.when.test("vite.config.js")).toBe(true);
	});

	it("test:unit always runs with coverage, in its command and not as a flag", () => {
		expect(TASKS["test:unit"]!.local).toEqual({ tool: "vitest", args: ["run", "--coverage"] });
		expect(Object.values(TASKS).filter((def) => "flags" in def)).toEqual([]);
	});

	it("the turbo tasks depend on the flat build id", () => {
		expect(TASKS["test:unit"]!.turbo!.dependsOn).toEqual(["build", "^build"]);
		expect(TASKS["typecheck"]!.turbo!.dependsOn).toEqual(["^build"]);
		expect(TASKS["lint:code"]!.turbo!.dependsOn).toEqual(["^build"]);
		expect(TASKS["build"]!.turbo!.dependsOn).toEqual(["^build"]);
	});

	it("the lint leaves each declare their fixed linterGroup, no auto-detect override", () => {
		expect(TASKS["lint:code"]!.linterGroup).toEqual(["eslint", "actionlint", "git-merge-conflict-markers"]);
		expect(TASKS["lint:editorconfig"]!.linterGroup).toEqual(["editorconfig"]);
		expect(TASKS["lint:markdown"]!.linterGroup).toEqual(["markdownlint"]);
		expect(TASKS["lint:data"]!.linterGroup).toEqual(["yamllint"]);
		expect(TASKS["lint:commits"]!.linterGroup).toEqual(["commitlint"]);
		expect(TASKS["scan:secrets"]!.linterGroup).toEqual(["gitleaks"]);
	});

	it("format is prettier alone: it writes, --check reads, and it has no workflow of its own", () => {
		const format = TASKS["format"]!;
		expect(format.suite).toBeUndefined();
		expect(format.linterGroup).toBeUndefined();
		expect(format.local).toEqual({ tool: "prettier", args: ["--write", "."] });
		expect(format.checkArgs).toEqual(["--check", "."]);
		expect(format.workflow).toBe(false);
	});

	it("lint and scan hold the six and two leaves of the spec, check-tokens stays outside scan", () => {
		const leaves = (suite: string) =>
			Object.entries(TASKS)
				.filter(([, def]) => def.suite === suite)
				.map(([id]) => id);
		expect(leaves("lint")).toEqual([
			"lint:code",
			"lint:editorconfig",
			"lint:markdown",
			"lint:data",
			"lint:unused",
			"lint:commits",
		]);
		expect(leaves("scan")).toEqual(["scan:secrets", "scan:code"]);
		expect(leaves("test")).toEqual(["test:unit", "test:visual", "test:perf"]);
		expect(TASKS["check-tokens"]!.suite).toBeUndefined();
	});

	it("the audit-decomposed tasks are standalone", () => {
		expect(TASKS["lint:unused"]!.local).toEqual({ tool: "knip" });
		expect(TASKS["measure-bundle"]!.local).toBeNull();
		expect(TASKS["test:perf"]!.local!.detect!.map((d) => d.tool)).toEqual(["lhci", "lhci"]);
		expect(TASKS["test:perf"]!.local!.detect![0]!.when.test("lighthouse.config.cjs")).toBe(true);
	});

	it("validate is a suite of two probe leaves, with no sub-jobs", () => {
		expect(TASKS["validate"]).toBeUndefined();
		expect(TASKS["validate:specs"]!.suite).toBe("validate");
		expect(TASKS["validate:docs"]!.suite).toBe("validate");
		// the plugins' own `validate:plugin` script is the third, package-scoped leaf: no runner, no workflow, not in ci
		expect(TASKS["validate:plugin"]).toMatchObject({
			suite: "validate",
			scope: "package",
			local: null,
			workflow: false,
		});
		expect(CI_ORDER).not.toContain("validate:plugin");
		expect(TASKS["validate:specs"]!.local).toEqual({ command: "probe specs check" });
		expect(TASKS["validate:docs"]!.local).toEqual({ command: "probe docs presence" });
		expect(Object.values(TASKS).filter((def) => "jobs" in def || "retiredJobs" in def)).toEqual([]);
	});

	it("preview-carrying tasks are flagged, not their own namespace (cross-cutting feature, not a task)", () => {
		expect(TASKS["release"]!.preview).toBe(true);
		expect(TASKS["deploy"]!.preview).toBe(true);
		expect(TASKS["publish-wiki"]!.preview).toBe(true);
		expect(TASKS["deploy-docs"]!.preview).toBe(true);
		expect(TASKS["deploy-components"]!.preview).toBe(true);
	});

	it("no tool name (eslint, vitest, tsdown, …) leaks into a task key", () => {
		for (const key of Object.keys(TASKS)) {
			expect(key.toLowerCase()).not.toMatch(/eslint|prettier|vitest|tsdown|knip|gitleaks|yamllint/);
		}
	});

	it("CI_ORDER lists known tasks, cheapest first", () => {
		expect(CI_ORDER.filter((name) => TASKS[name] === undefined)).toEqual([]);
		expect(CI_ORDER.indexOf("typecheck")).toBeLessThan(CI_ORDER.indexOf("test:unit"));
		expect(CI_ORDER.indexOf("lint:code")).toBeLessThan(CI_ORDER.indexOf("test:unit"));
	});
});
