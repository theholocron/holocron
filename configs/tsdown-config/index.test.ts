import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

		it("resolves outDir to an absolute path (tsdown-config#regression — clients#376's broken release, see resolve-entry.ts)", () => {
			// Same bug class as entry above, just never patched for outDir until
			// it silently published 14 packages with an empty dist/ -- confirmed
			// live, the real output landed in
			// node_modules/@theholocron/tsdown-config/dist/presets/dist/.
			const config = cli();
			expect(config.outDir).toBe(resolve(process.cwd(), "dist"));
		});

		it("resolves an overridden outDir to an absolute path too, not just the default", () => {
			const config = cli({ outDir: "build" });
			expect(config.outDir).toBe(resolve(process.cwd(), "build"));
		});
	});

	describe("library preset bundle-size guard", () => {
		type OnSuccess = (config: { outDir: string }, signal: AbortSignal) => Promise<void>;
		const run = (config: ReturnType<typeof library>, outDir: string) =>
			(config.onSuccess as unknown as OnSuccess)({ outDir }, new AbortController().signal);
		let dir: string;

		beforeEach(() => {
			dir = mkdtempSync(join(tmpdir(), "library-preset-"));
		});

		afterEach(() => {
			rmSync(dir, { recursive: true });
		});

		it("passes a build whose bundles are small", async () => {
			writeFileSync(join(dir, "index.mjs"), "export {};");
			await expect(run(library(), dir)).resolves.toBeUndefined();
		});

		it("fails a build that emitted an oversized bundle", async () => {
			writeFileSync(join(dir, "index.mjs"), "x".repeat(512_001));
			await expect(run(library(), dir)).rejects.toThrow(/index\.mjs/);
		});

		it("runs the caller's onSuccess function after the check", async () => {
			const onSuccess = vi.fn();
			writeFileSync(join(dir, "index.mjs"), "export {};");
			await run(library({ onSuccess }), dir);
			expect(onSuccess).toHaveBeenCalledOnce();
		});

		it("does not run the caller's onSuccess when the check fails", async () => {
			const onSuccess = vi.fn();
			writeFileSync(join(dir, "index.mjs"), "x".repeat(512_001));
			await expect(run(library({ onSuccess }), dir)).rejects.toThrow();
			expect(onSuccess).not.toHaveBeenCalled();
		});

		it("runs the caller's onSuccess shell command after the check", async () => {
			const marker = join(dir, "marker");
			writeFileSync(join(dir, "index.mjs"), "export {};");
			await run(library({ onSuccess: `touch ${marker}` }), dir);
			expect(() => writeFileSync(marker, "", { flag: "r" })).not.toThrow();
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

		it("externalizes every dependency by default, not just @theholocron/* peers", () => {
			// a package with real third-party runtime deps (e.g. google-client's
			// googleapis) must not get them bundled -- confirmed this was
			// happening under the old narrower regex, saved only by tree-shaking
			// stripping the unreachable code back out before final emit
			const config = library();
			expect(config.deps).toEqual({ neverBundle: true });
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

		it("resolves outDir to an absolute path (tsdown-config#regression — clients#376's broken release, see resolve-entry.ts)", () => {
			// Same bug class as entry above, just never patched for outDir until
			// it silently published 14 packages with an empty dist/ -- confirmed
			// live, the real output landed in
			// node_modules/@theholocron/tsdown-config/dist/presets/dist/.
			const config = library();
			expect(config.outDir).toBe(resolve(process.cwd(), "dist"));
		});

		it("resolves an overridden outDir to an absolute path too, not just the default", () => {
			const config = library({ outDir: "build" });
			expect(config.outDir).toBe(resolve(process.cwd(), "build"));
		});
	});
});
