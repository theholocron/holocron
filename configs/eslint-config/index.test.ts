import { describe, it, expect } from "vitest";
import { base } from "./configs/base.js";
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
});

describe("eslint-config — bundles", () => {
	it("library() returns a non-empty flat config array", () => {
		const config = library();
		expect(Array.isArray(config)).toBe(true);
		expect(config.length).toBeGreaterThan(0);
	});

	it("library() includes a config named @theholocron/library", () => {
		const config = library();
		expect(
			config.some(
				(c) => "name" in c && c.name === "@theholocron/library",
			),
		).toBe(true);
	});
});
