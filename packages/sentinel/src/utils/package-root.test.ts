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

	it("returns the starting dir itself when it directly holds node_modules", async () => {
		await mkdir(join(root, "node_modules"));
		expect(findPackageRoot(root)).toBe(root);
	});

	it("walks upward through nested source dirs to find node_modules", async () => {
		await mkdir(join(root, "node_modules"));
		const nested = join(root, "src", "utils");
		await mkdir(nested, { recursive: true });
		expect(findPackageRoot(nested)).toBe(root);
	});

	it("ignores a package.json with no node_modules alongside it", async () => {
		const decoy = join(root, "decoy");
		await mkdir(decoy, { recursive: true });
		await writeFile(join(decoy, "package.json"), "{}");
		await mkdir(join(root, "node_modules"));
		expect(findPackageRoot(decoy)).toBe(root);
	});
});
