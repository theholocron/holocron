import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { resolveEntry, resolveOutDir } from "./resolve-entry.js";

describe("resolveEntry", () => {
	it("resolves a single string entry to an absolute path against cwd", () => {
		expect(resolveEntry("src/index.ts")).toBe(resolve(process.cwd(), "src/index.ts"));
	});

	it("resolves every entry in an array to an absolute path against cwd", () => {
		expect(resolveEntry(["src/index.ts", "src/testing.ts"])).toEqual([
			resolve(process.cwd(), "src/index.ts"),
			resolve(process.cwd(), "src/testing.ts"),
		]);
	});

	it("leaves an already-absolute entry unchanged (resolve() is idempotent for it)", () => {
		const absolute = resolve(process.cwd(), "src/index.ts");
		expect(resolveEntry(absolute)).toBe(absolute);
	});

	it("passes through a Record-shaped entry unresolved — not a shape any preset here uses", () => {
		const record = { "utils/*": "./src/utils/*.ts" };
		expect(resolveEntry(record)).toBe(record);
	});

	it("passes through undefined unchanged", () => {
		expect(resolveEntry(undefined)).toBeUndefined();
	});
});

describe("resolveOutDir", () => {
	it("resolves a relative outDir to an absolute path against cwd", () => {
		expect(resolveOutDir("dist")).toBe(resolve(process.cwd(), "dist"));
	});

	it("leaves an already-absolute outDir unchanged (resolve() is idempotent for it)", () => {
		const absolute = resolve(process.cwd(), "dist");
		expect(resolveOutDir(absolute)).toBe(absolute);
	});
});
