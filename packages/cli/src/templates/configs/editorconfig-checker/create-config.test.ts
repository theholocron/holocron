import { describe, expect, it } from "vitest";

import { createConfig } from "./create-config.js";

describe("editorconfig-checker createConfig", () => {
	it("returns valid JSON with expected keys", () => {
		const parsed = JSON.parse(createConfig());
		expect(parsed.Version).toBe("v3.7.0");
		expect(parsed.Disable).toBeDefined();
		expect(parsed.Exclude).toContain("(^|.+/)LICENSE$");
	});

	it("ends with a trailing newline", () => {
		expect(createConfig()).toMatch(/\n$/);
	});
});
