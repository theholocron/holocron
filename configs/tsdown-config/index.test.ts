import { describe, it, expect } from "vitest";
import { library } from "./presets/library.js";

describe("tsdown-config", () => {
	describe("library preset", () => {
		it("returns a tsdown config object", () => {
			const config = library();
			expect(typeof config).toBe("object");
			expect(config).not.toBeNull();
		});

		it("targets ESM format", () => {
			const config = library();
			expect(config.format).toContain("esm");
		});

		it("enables dts generation", () => {
			const config = library();
			expect(config.dts).toBe(true);
		});

		it("accepts option overrides", () => {
			const config = library({ clean: false });
			expect(config.clean).toBe(false);
		});
	});
});
