import { describe, expect, it } from "vitest";

import { CI_ORDER, KNOWN_TASKS, TASKS } from "./registry.js";

describe("TASKS registry", () => {
	it("keys are the intent-facing dotted vocabulary (namespace.taskName)", () => {
		for (const key of Object.keys(TASKS)) {
			expect(key).toMatch(/^[a-z][a-zA-Z]*\.[a-zA-Z]+$/);
		}
	});

	it("KNOWN_TASKS mirrors the registry keys", () => {
		expect([...KNOWN_TASKS].sort()).toEqual(Object.keys(TASKS).sort());
	});

	it("every runner has exactly one of tool / detect / command (or local is null)", () => {
		const runners = Object.entries(TASKS).flatMap(([name, def]) => [
			[name, def.local] as const,
			...Object.entries(def.jobs ?? {}).map(([j, jd]) => [`${name}/${j}`, jd.local] as const),
		]);
		for (const [name, local] of runners) {
			if (local === null) continue;
			const forms = [local.tool, local.detect, local.command].filter((v) => v !== undefined);
			expect(forms, `${name}.local`).toHaveLength(1);
		}
	});

	it("no sub-job uses the command (holocron-subcommand) runner form", () => {
		for (const [name, def] of Object.entries(TASKS)) {
			for (const [job, jd] of Object.entries(def.jobs ?? {})) {
				expect(jd.local?.command, `${name}/${job}`).toBeUndefined();
			}
		}
	});

	it("delivery.build detects tsdown before vite before tsc", () => {
		const detect = TASKS["delivery.build"]!.local!.detect!;
		expect(detect.map((d) => d.tool)).toEqual(["tsdown", "vite", "rollup", "tsc"]);
		expect(detect[0]!.when.test("tsdown.config.ts")).toBe(true);
		expect(detect[0]!.when.test("tsdown.config.mjs")).toBe(true);
		expect(detect[1]!.when.test("vite.config.js")).toBe(true);
	});

	it("verification.unitTests carries the --coverage org default for vitest", () => {
		expect(TASKS["verification.unitTests"]!.flags?.vitest).toEqual(["--coverage"]);
	});

	it("the lint-decomposed tasks each declare their fixed linterGroup, no auto-detect override", () => {
		expect(TASKS["sourceQuality.staticAnalysis"]!.linterGroup).toEqual([
			"eslint",
			"actionlint",
			"git-merge-conflict-markers",
		]);
		expect(TASKS["sourceQuality.formatting"]!.linterGroup).toEqual(["prettier", "editorconfig", "markdownlint"]);
		expect(TASKS["sourceQuality.structuredDataValidation"]!.linterGroup).toEqual(["yamllint"]);
		expect(TASKS["security.secretDetection"]!.linterGroup).toEqual(["gitleaks"]);
		expect(TASKS["platform.commitStandards"]!.linterGroup).toEqual(["commitlint"]);
	});

	it("the audit-decomposed tasks are standalone, not nested under one 'audit' task", () => {
		expect(KNOWN_TASKS.has("audit")).toBe(false);
		expect(TASKS["sourceQuality.deadCodeAnalysis"]!.local).toEqual({ tool: "knip" });
		expect(TASKS["delivery.bundleSize"]!.local).toBeNull();
		expect(TASKS["verification.performance"]!.local!.detect!.map((d) => d.tool)).toEqual(["lhci", "lhci"]);
		expect(TASKS["verification.performance"]!.local!.detect![0]!.when.test("lighthouse.config.cjs")).toBe(true);
	});

	it("platform.repoValidation bundles the process/governance scripts as jobs, not a linterGroup", () => {
		const jobs = TASKS["platform.repoValidation"]!.jobs!;
		expect(Object.keys(jobs)).toEqual(["adrs", "registry", "docsPresence"]);
		expect(jobs.adrs!.local).toEqual({ tool: "node", args: ["scripts/validate-adrs.mjs"] });
		expect(jobs.registry!.local).toEqual({ tool: "node", args: ["scripts/validate-registry.mjs"] });
		expect(jobs.docsPresence!.local).toEqual({ tool: "node", args: ["scripts/validate-docs-presence.mjs"] });
	});

	it("preview-carrying tasks are flagged, not their own namespace (cross-cutting feature, not a task)", () => {
		expect(TASKS["delivery.publish"]!.preview).toBe(true);
		expect(TASKS["delivery.deploy"]!.preview).toBe(true);
		expect(TASKS["knowledge.wiki"]!.preview).toBe(true);
		expect(TASKS["knowledge.docs"]!.preview).toBe(true);
		expect(TASKS["knowledge.components"]!.preview).toBe(true);
	});

	it("no tool name (eslint, vitest, tsdown, …) leaks into a task key", () => {
		for (const key of Object.keys(TASKS)) {
			expect(key.toLowerCase()).not.toMatch(/eslint|prettier|vitest|tsdown|knip|gitleaks|yamllint/);
		}
	});

	it("CI_ORDER lists known tasks, cheapest first", () => {
		for (const name of CI_ORDER) expect(KNOWN_TASKS.has(name)).toBe(true);
		expect(CI_ORDER.indexOf("verification.typeSafety")).toBeLessThan(CI_ORDER.indexOf("verification.unitTests"));
		expect(CI_ORDER.indexOf("sourceQuality.staticAnalysis")).toBeLessThan(
			CI_ORDER.indexOf("verification.unitTests")
		);
	});
});
