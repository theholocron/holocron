import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { findPackageRoot } from "./package-root.js";

describe("findPackageRoot", () => {
	let root: string;

	beforeEach(async () => {
		root = await mkdtemp(join(tmpdir(), "sentinel-package-root-"));
	});
	afterEach(async () => {
		await rm(root, { recursive: true, force: true });
	});

	it("returns the starting dir itself when it directly holds a package.json", async () => {
		await writeFile(join(root, "package.json"), "{}");
		expect(findPackageRoot(root)).toBe(root);
	});

	it("walks upward through nested source dirs to find package.json", async () => {
		await writeFile(join(root, "package.json"), "{}");
		const nested = join(root, "src", "utils");
		await mkdir(nested, { recursive: true });
		expect(findPackageRoot(nested)).toBe(root);
	});
});
