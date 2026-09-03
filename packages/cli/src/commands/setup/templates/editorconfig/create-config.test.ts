import { describe, expect, it } from "vitest";

import { createConfig } from "./create-config.js";

describe("editorconfig createConfig", () => {
	it("includes the auto-generated header", () => {
		expect(createConfig()).toContain("AUTO-GENERATED — do not edit directly");
	});

	it("sets root = true", () => {
		expect(createConfig()).toContain("root = true");
	});

	it("uses tab indentation for general files", () => {
		expect(createConfig()).toContain("indent_style = tab");
	});

	it("uses space indentation for json/yml files", () => {
		const out = createConfig();
		expect(out).toContain("[*.{json,yml,yaml}]");
		expect(out).toContain("indent_size = 2");
	});
});
