import { describe, expect, it } from "vitest";

import { createConfig } from "./create-config.js";

describe("editorconfig-checker createConfig", () => {
	it("returns valid JSON with expected keys", () => {
		const parsed = JSON.parse(createConfig());
		expect(parsed.Disable).toBeDefined();
		expect(parsed.Exclude).toContain("(^|.+/)LICENSE$");
	});

	it("pins no `Version` — the field is a hard gate that breaks on any local/CI binary drift (#618)", () => {
		expect(JSON.parse(createConfig())).not.toHaveProperty("Version");
	});

	it("ends with a trailing newline", () => {
		expect(createConfig()).toMatch(/\n$/);
	});
});
