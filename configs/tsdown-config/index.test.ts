import { describe, it, expect } from "vitest";
import { cli } from "./presets/cli.js";
import { library } from "./presets/library.js";

describe("tsdown-config", () => {
	describe("cli preset", () => {
		it("returns a tsdown config object", () => {
			const config = cli();
			expect(typeof config).toBe("object");
			expect(config).not.toBeNull();
		});

		it("targets ESM format", () => {
			const config = cli();
			expect(config.format).toContain("esm");
		});

		it("disables dts generation", () => {
			const config = cli();
			expect(config.dts).toBe(false);
		});

		it("adds Node.js shebang banner", () => {
			const config = cli();
			expect((config.banner as { js: string }).js).toBe("#!/usr/bin/env node");
		});

		it("accepts option overrides", () => {
			const config = cli({ clean: false });
			expect(config.clean).toBe(false);
		});
	});

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
