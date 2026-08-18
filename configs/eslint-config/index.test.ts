import { Linter } from "eslint";
import { describe, it, expect } from "vitest";
import { base } from "./configs/base.js";
import { packageJson } from "./configs/package-json.js";
import { typescript } from "./configs/typescript.js";
import { node } from "./configs/node.js";
import { react } from "./configs/react.js";
import { library } from "./bundles/library.js";

describe("eslint-config — individual configs", () => {
	it("base() returns a non-empty flat config array", () => {
		const config = base();
		expect(Array.isArray(config)).toBe(true);
		expect(config.length).toBeGreaterThan(0);
	});

	it("typescript() returns a non-empty flat config array", () => {
		const config = typescript();
		expect(Array.isArray(config)).toBe(true);
		expect(config.length).toBeGreaterThan(0);
	});

	it("node() returns a non-empty flat config array", () => {
		const config = node();
		expect(Array.isArray(config)).toBe(true);
		expect(config.length).toBeGreaterThan(0);
	});

	it("react() returns a non-empty flat config array", () => {
		const config = react();
		expect(Array.isArray(config)).toBe(true);
		expect(config.length).toBeGreaterThan(0);
	});

	it("react() config runs without throwing on ESLint v10 context API", () => {
		const linter = new Linter({ configType: "flat" });
		expect(() => linter.verify("const x = 1;", react() as Parameters<Linter["verify"]>[1])).not.toThrow();
	});
});

describe("eslint-config — package-json config", () => {
	it("packageJson() returns a non-empty flat config array", () => {
		const config = packageJson();
		expect(Array.isArray(config)).toBe(true);
		expect(config.length).toBeGreaterThan(0);
	});

	it("packageJson() targets package.json files", () => {
		const config = packageJson();
		const files = config.flatMap((c) => ("files" in c ? (c.files as string[]) : []));
		expect(files.some((f) => f.includes("package.json"))).toBe(true);
	});

	it("packageJson() disables dependency-version-range", () => {
		const config = packageJson();
		const rules = config.flatMap((c) => ("rules" in c ? Object.entries(c.rules ?? {}) : []));
		expect(rules.some(([k, v]) => k === "package-json/dependency-version-range" && v === "off")).toBe(true);
	});

	it("packageJson() disables no-wildcard-dependencies", () => {
		const config = packageJson();
		const rules = config.flatMap((c) => ("rules" in c ? Object.entries(c.rules ?? {}) : []));
		expect(rules.some(([k, v]) => k === "package-json/no-wildcard-dependencies" && v === "off")).toBe(true);
	});
});

describe("eslint-config — bundles", () => {
	it("library() returns a non-empty flat config array", () => {
		const config = library();
		expect(Array.isArray(config)).toBe(true);
		expect(config.length).toBeGreaterThan(0);
	});

	it("library() includes a config named @theholocron/library", () => {
		const config = library();
		expect(config.some((c) => "name" in c && c.name === "@theholocron/library")).toBe(true);
	});
});
