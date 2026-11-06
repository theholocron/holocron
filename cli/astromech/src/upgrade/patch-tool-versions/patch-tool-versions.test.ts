import { describe, expect, it } from "vitest";

import { patchToolVersions } from "./patch-tool-versions.js";

describe("patchToolVersions", () => {
	it("rewrites the nodejs line only", () => {
		expect(patchToolVersions("nodejs 20.11.0\npnpm 9.0.0\n", 20, 22)).toBe("nodejs 22.11.0\npnpm 9.0.0\n");
	});

	it("returns null for another major or no nodejs line", () => {
		expect(patchToolVersions("nodejs 18.0.0\n", 20, 22)).toBeNull();
		expect(patchToolVersions("pnpm 20.0.0\n", 20, 22)).toBeNull();
	});
});
