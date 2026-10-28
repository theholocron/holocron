import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { resolveBin } from "./resolve-bin.js";

describe("resolveBin", () => {
	it("returns the project's node_modules/.bin path when it exists", () => {
		const local = join("/repo", "node_modules", ".bin", "turbo");
		expect(resolveBin("/repo", "turbo", (p) => p === local)).toBe(local);
	});

	it("falls back to the bare tool name", () => {
		expect(resolveBin("/repo", "turbo", () => false)).toBe("turbo");
	});
});
