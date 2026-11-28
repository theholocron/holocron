import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

interface PackageJson {
	exports: Record<string, unknown>;
	publishConfig: { exports: Record<string, unknown> };
}

const pkg = JSON.parse(
	readFileSync(fileURLToPath(new URL("../../package.json", import.meta.url)), "utf8")
) as PackageJson;

// `publishConfig.exports` replaces `exports` in the published package, so a subpath missing there is importable from
// the workspace but not from npm, a packed copy or Sentinel's sandbox (`@theholocron/cli/presets`, holocron.config.ts).
describe("package.json exports", () => {
	it("publishes every subpath the workspace exports", () => {
		expect(Object.keys(pkg.publishConfig.exports).sort()).toEqual(Object.keys(pkg.exports).sort());
	});

	it.each(Object.entries(pkg.publishConfig.exports))(
		"points %s at dist, with the types next to the build",
		(_, target) => {
			const { types, import: esm, default: fallback } = target as Record<string, string>;
			expect(types).toMatch(/^\.\/dist\/.+\.d\.mts$/);
			expect(esm).toMatch(/^\.\/dist\/.+\.mjs$/);
			expect(fallback).toBe(esm);
		}
	);
});
