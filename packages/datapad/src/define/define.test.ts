import { describe, expect, expectTypeOf, it } from "vitest";

import { createDefineConfig } from "./define.js";

interface Sample {
	name: string;
	tags?: string[];
}

describe("createDefineConfig", () => {
	const defineConfig = createDefineConfig<Sample>();

	it("returns the config unchanged", () => {
		const cfg = { name: "x", tags: ["a"] };
		expect(defineConfig(cfg)).toBe(cfg);
	});

	it("preserves the literal type of the argument", () => {
		const cfg = defineConfig({ name: "x", tags: ["a", "b"] });
		expectTypeOf(cfg.tags).toEqualTypeOf<string[]>();
		expect(cfg).toEqual({ name: "x", tags: ["a", "b"] });
	});
});
