import { describe, expect, it } from "vitest";

import { isGeneratedScript, mergeScripts } from "./merge-scripts.js";

describe("isGeneratedScript", () => {
	it("knows a turbo call and a holocron wrapper, with any binary in front of `run`", () => {
		expect(isGeneratedScript("turbo run build")).toBe(true);
		expect(isGeneratedScript("holocron run build --")).toBe(true);
		expect(isGeneratedScript("node cli/cli/dist/cli.mjs run build --")).toBe(true);
	});

	it("does not take a real command for one", () => {
		expect(isGeneratedScript("tsdown")).toBe(false);
		expect(isGeneratedScript("vitest run")).toBe(false);
		expect(isGeneratedScript("tsc -b && node run build --")).toBe(false);
	});
});

describe("mergeScripts", () => {
	it("sets the desired scripts, keeps the rest and lists what changed, sorted", () => {
		const { scripts, changed } = mergeScripts(
			{ dev: "astro dev", test: "turbo run old" },
			{ test: "turbo run test", build: "turbo run build" },
			new Set()
		);
		expect(scripts).toEqual({ dev: "astro dev", test: "turbo run test", build: "turbo run build" });
		expect(changed).toEqual(["build", "test"]);
	});

	it("reports nothing changed when every script is current", () => {
		expect(
			mergeScripts({ format: "prettier --write ." }, { format: "prettier --write ." }, new Set()).changed
		).toEqual([]);
	});

	it("leaves a real command in a script turbo fans out (#747), whichever way it was named", () => {
		const existing = { build: "tsdown", "delivery.build": "tsdown", typecheck: "tsc --noEmit" };
		const desired = {
			build: "turbo run build",
			"delivery.build": "holocron run delivery.build --",
			typecheck: "turbo run typecheck",
		};
		const merged = mergeScripts(existing, desired, new Set(["delivery.build"]));
		expect(merged.scripts).toEqual(existing);
		expect(merged.changed).toEqual([]);
	});

	it("replaces a generated script that is guarded, and sets a guarded one that does not exist yet", () => {
		const merged = mergeScripts(
			{ build: "holocron run build --", lint: "turbo run old" },
			{ build: "turbo run build", lint: "turbo run lint", typecheck: "turbo run typecheck" },
			new Set()
		);
		expect(merged.changed).toEqual(["build", "lint", "typecheck"]);
	});

	it("overwrites a hand edit of a script the generator owns", () => {
		expect(mergeScripts({ format: "prettier ." }, { format: "prettier --write ." }, new Set()).changed).toEqual([
			"format",
		]);
	});
});
