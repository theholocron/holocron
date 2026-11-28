import { describe, expect, it } from "vitest";

import { patchYaml } from "./patch-yaml.js";

describe("patchYaml", () => {
	it.each([
		["node-version: 20", "node-version: 22"],
		["node-version: '20'", "node-version: '22'"],
		['node-version: "20"', 'node-version: "22"'],
	])("rewrites %s", (input, expected) => {
		expect(patchYaml(input, 20, 22)).toBe(expected);
	});

	it("returns null for a different major or no pin", () => {
		expect(patchYaml("node-version: 18", 20, 22)).toBeNull();
		expect(patchYaml("name: ci", 20, 22)).toBeNull();
	});
});
