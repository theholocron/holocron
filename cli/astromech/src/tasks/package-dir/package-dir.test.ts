import { describe, expect, it } from "vitest";

import { insidePackage } from "./package-dir.js";

const exists =
	(...files: string[]) =>
	(path: string) =>
		files.includes(path);

describe("insidePackage", () => {
	it("is true for a directory with a package.json under a directory with a turbo.json", () => {
		expect(insidePackage("/repo/pkgs/a", exists("/repo/pkgs/a/package.json", "/repo/turbo.json"))).toBe(true);
	});

	it("is false at the workspace root, which has a turbo.json of its own", () => {
		expect(insidePackage("/repo", exists("/repo/package.json", "/repo/turbo.json"))).toBe(false);
	});

	it("is false for a directory that is not a package", () => {
		expect(insidePackage("/repo/pkgs/a", exists("/repo/turbo.json"))).toBe(false);
	});

	it("is false when no directory above has a turbo.json", () => {
		expect(insidePackage("/repo/pkgs/a", exists("/repo/pkgs/a/package.json"))).toBe(false);
	});
});
