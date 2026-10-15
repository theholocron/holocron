import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { packageJsonScript } from "./package-json-script.js";

const MANIFEST = join("/r", "package.json");
const readFile = (path: string) => {
	if (path !== MANIFEST) throw new Error(`unexpected read of ${path}`);
	return '{"scripts":{"test":"vitest","bad":7}}';
};
const exists = (path: string) => path === MANIFEST;

describe("packageJsonScript", () => {
	it("returns the script's command", () => {
		expect(packageJsonScript("/r", "test", readFile, exists)).toBe("vitest");
	});

	it("is undefined for a missing script, a non-string script or no package.json", () => {
		expect(packageJsonScript("/r", "build", readFile, exists)).toBeUndefined();
		expect(packageJsonScript("/r", "bad", readFile, exists)).toBeUndefined();
		expect(packageJsonScript("/r", "test", readFile, () => false)).toBeUndefined();
	});
});
