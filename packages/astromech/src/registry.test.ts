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
		for (const [name, def] of Object.entries(TASKS)) {
			if (def.local === null) continue;
			const forms = [def.local.tool, def.local.detect, def.local.command].filter((v) => v !== undefined);
			expect(forms, `${name}.local`).toHaveLength(1);
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

	it("CI_ORDER lists known tasks, cheapest first", () => {
		for (const name of CI_ORDER) expect(KNOWN_TASKS.has(name)).toBe(true);
		expect(CI_ORDER.indexOf("typecheck")).toBeLessThan(CI_ORDER.indexOf("test"));
		expect(CI_ORDER.indexOf("lint")).toBeLessThan(CI_ORDER.indexOf("test"));
	});
});
