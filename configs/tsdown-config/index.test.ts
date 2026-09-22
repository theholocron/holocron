import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

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

		it("resolves entry to an absolute path (tsdown-config#regression — see resolve-entry.ts)", () => {
			// tsdown resolves a relative entry against the config *file's* own
			// directory, not the invoking cwd -- wrong the moment --config
			// points at this preset's own location deep in node_modules
			// (astromech's resolver, holocron#749/#750/#680). An absolute path
			// sidesteps it regardless of where the config module lives.
			const config = cli();
			expect(config.entry).toEqual([resolve(process.cwd(), "src/cli.ts")]);
		});

		it("resolves an overridden entry to an absolute path too, not just the default", () => {
			const config = cli({ entry: ["src/other-cli.ts"] });
			expect(config.entry).toEqual([resolve(process.cwd(), "src/other-cli.ts")]);
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

		it("resolves entry to an absolute path", () => {
			const config = library();
			expect(config.entry).toEqual([resolve(process.cwd(), "src/index.ts")]);
		});

		it("resolves a multi-entry override to absolute paths too (e.g. http-client's testing.ts second entry)", () => {
			const config = library({ entry: ["src/index.ts", "src/testing.ts"] });
			expect(config.entry).toEqual([
				resolve(process.cwd(), "src/index.ts"),
				resolve(process.cwd(), "src/testing.ts"),
			]);
		});
	});
});
