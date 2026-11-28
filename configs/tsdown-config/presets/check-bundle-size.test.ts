import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { checkBundleSize, MAX_BUNDLE_BYTES } from "./check-bundle-size.js";

describe("checkBundleSize", () => {
	let dir: string;

	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), "bundle-size-"));
	});

	afterEach(() => {
		rmSync(dir, { recursive: true });
	});

	it("passes when every bundle is under the threshold", () => {
		writeFileSync(join(dir, "index.mjs"), "x".repeat(100));
		expect(() => checkBundleSize(dir)).not.toThrow();
	});

	it("passes at exactly the threshold", () => {
		writeFileSync(join(dir, "index.mjs"), "x".repeat(MAX_BUNDLE_BYTES));
		expect(() => checkBundleSize(dir)).not.toThrow();
	});

	it("fails and names the file when a bundle is over the threshold", () => {
		writeFileSync(join(dir, "index.mjs"), "x".repeat(MAX_BUNDLE_BYTES + 1));
		expect(() => checkBundleSize(dir)).toThrow(/index\.mjs.*exceeding the 512KB threshold.*holocron#762/);
	});

	it.each(["index.js", "index.cjs"])("also checks %s", (name) => {
		writeFileSync(join(dir, name), "x".repeat(MAX_BUNDLE_BYTES + 1));
		expect(() => checkBundleSize(dir)).toThrow(name);
	});

	it("ignores files that are not JavaScript bundles", () => {
		writeFileSync(join(dir, "index.d.mts"), "x".repeat(MAX_BUNDLE_BYTES + 1));
		writeFileSync(join(dir, "index.mjs.map"), "x".repeat(MAX_BUNDLE_BYTES + 1));
		expect(() => checkBundleSize(dir)).not.toThrow();
	});

	it("reports every oversized bundle", () => {
		writeFileSync(join(dir, "a.mjs"), "x".repeat(11));
		writeFileSync(join(dir, "b.mjs"), "x".repeat(11));
		expect(() => checkBundleSize(dir, 10)).toThrow(/a\.mjs.*b\.mjs/);
	});

	it("honors a custom threshold", () => {
		writeFileSync(join(dir, "index.mjs"), "x".repeat(11));
		expect(() => checkBundleSize(dir, 10)).toThrow(/exceeding the 0KB/);
	});

	it("does not fail when the output directory does not exist", () => {
		expect(() => checkBundleSize(join(dir, "missing"))).not.toThrow();
	});

	it("rethrows any other read error", () => {
		writeFileSync(join(dir, "file"), "");
		expect(() => checkBundleSize(join(dir, "file"))).toThrow();
	});
});
