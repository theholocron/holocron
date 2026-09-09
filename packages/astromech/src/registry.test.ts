import { describe, expect, it } from "vitest";

import { CI_ORDER, KNOWN_TASKS, TASKS } from "./registry.js";

describe("TASKS registry", () => {
	it("keys are lower-case task names matching workflow templates", () => {
		for (const key of Object.keys(TASKS)) {
			expect(key).toMatch(/^[a-z][a-z-]*$/);
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

	it("build detects tsdown before vite before tsc", () => {
		const detect = TASKS.build!.local!.detect!;
		expect(detect.map((d) => d.tool)).toEqual(["tsdown", "vite", "rollup", "tsc"]);
		expect(detect[0]!.when.test("tsdown.config.ts")).toBe(true);
		expect(detect[0]!.when.test("tsdown.config.mjs")).toBe(true);
		expect(detect[1]!.when.test("vite.config.js")).toBe(true);
	});

	it("test carries the --coverage org default for vitest", () => {
		expect(TASKS.test!.flags?.vitest).toEqual(["--coverage"]);
	});

	it("lint is marked as the linter aggregate", () => {
		expect(TASKS.lint!.linters).toBe(true);
		expect(KNOWN_TASKS.has("lint")).toBe(true);
	});

	it("audit declares bundle-size / knip / performance jobs, in that order", () => {
		const jobs = TASKS.audit!.jobs!;
		expect(Object.keys(jobs)).toEqual(["bundle-size", "knip", "performance"]);
		expect(jobs["bundle-size"]!.local).toBeNull();
		expect(jobs.knip!.local).toEqual({ tool: "knip" });
		expect(jobs.performance!.local!.detect!.map((d) => d.tool)).toEqual(["lhci", "lhci"]);
		expect(jobs.performance!.local!.detect![0]!.when.test("lighthouse.config.cjs")).toBe(true);
	});

	it("every job maps to a `audit / …` check context", () => {
		const contexts = Object.values(TASKS.audit!.jobs!).map((j) => j.checkContext);
		expect(contexts).toEqual(["audit / Audit the bundle size", "audit / Knip", "audit / Audit the performance"]);
	});

	it("CI_ORDER lists known tasks, cheapest first", () => {
		for (const name of CI_ORDER) expect(KNOWN_TASKS.has(name)).toBe(true);
		expect(CI_ORDER.indexOf("typecheck")).toBeLessThan(CI_ORDER.indexOf("test"));
		expect(CI_ORDER.indexOf("lint")).toBeLessThan(CI_ORDER.indexOf("test"));
	});
});
