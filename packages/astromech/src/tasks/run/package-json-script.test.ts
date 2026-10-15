import { describe, expect, it } from "vitest";

import { packageJsonScript } from "./package-json-script.js";

describe("packageJsonScript", () => {
	const readFile = () => '{"scripts":{"test":"vitest","bad":7}}';

	it("returns the script's command", () => {
		expect(packageJsonScript("/r", "test", readFile, () => true)).toBe("vitest");
	});

	it("is undefined for a missing script, a non-string script or no package.json", () => {
		expect(packageJsonScript("/r", "build", readFile, () => true)).toBeUndefined();
		expect(packageJsonScript("/r", "bad", readFile, () => true)).toBeUndefined();
		expect(packageJsonScript("/r", "test", readFile, () => false)).toBeUndefined();
	});
});
