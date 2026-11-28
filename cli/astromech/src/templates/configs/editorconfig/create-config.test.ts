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

	it("unsets indent_style for markdown files -- list continuation lines always align with spaces regardless of style, no matter the general default", () => {
		const out = createConfig();
		const section = out.slice(out.indexOf("[*.{md,mdx}]"));
		expect(section).toContain("indent_style = unset");
	});
});
