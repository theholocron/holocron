import { describe, expect, it } from "vitest";

import { createConfig, createIgnoreConfig } from "./create-config.js";

describe("yamllint createConfig", () => {
	it("includes the auto-generated header", () => {
		expect(createConfig()).toContain("AUTO-GENERATED — do not edit directly");
	});

	it("uses ignore-from-file for .gitignore and .yamlignore", () => {
		const out = createConfig();
		expect(out).toContain(".gitignore");
		expect(out).toContain(".yamlignore");
	});

	it("extends default ruleset", () => {
		expect(createConfig()).toContain("extends: default");
	});

	it("disables line-length rule", () => {
		expect(createConfig()).toContain("line-length: disable");
	});
});

describe("yamllint createIgnoreConfig", () => {
	it("includes the auto-generated header", () => {
		expect(createIgnoreConfig()).toContain("AUTO-GENERATED — do not edit directly");
	});

	it("ignores pnpm-lock.yaml", () => {
		expect(createIgnoreConfig()).toContain("pnpm-lock.yaml");
	});
});
