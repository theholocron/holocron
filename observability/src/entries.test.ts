import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const SRC = dirname(fileURLToPath(import.meta.url));

/** Every bare module (an SDK or a package) the entry reaches through its relative imports. */
function bareImports(file: string, seen = new Set<string>()): Set<string> {
	const found = new Set<string>();
	if (seen.has(file)) return found;
	seen.add(file);
	const source = readFileSync(file, "utf8");
	for (const match of source.matchAll(/^(?:import|export)\s[^"']*?from\s+["']([^"']+)["']/gm)) {
		const specifier = match[1]!;
		if (specifier.startsWith(".")) {
			const target = resolve(dirname(file), specifier.replace(/\.js$/, ".ts"));
			for (const name of bareImports(target, seen)) found.add(name);
		} else {
			found.add(specifier);
		}
	}
	return found;
}

describe("per-adapter entries load only their own SDK", () => {
	const cases: [entry: string, sdks: string[]][] = [
		["browser-sentry.ts", ["@sentry/browser"]],
		["browser-posthog.ts", ["posthog-js"]],
		["edge-sentry.ts", ["@sentry/vercel-edge"]],
		["edge-posthog.ts", []],
		["react-native.ts", []],
		["core.ts", []],
	];
	it.each(cases)("%s imports exactly %j", (entry, sdks) => {
		expect([...bareImports(resolve(SRC, entry))].sort()).toEqual(sdks);
	});
});

describe("package.json exports", () => {
	const pkg = JSON.parse(readFileSync(resolve(SRC, "../package.json"), "utf8")) as {
		exports: Record<string, { import: string }>;
	};
	it("has one subpath per adapter, each built from its own entry", () => {
		for (const [subpath, file] of [
			["./browser/sentry", "browser-sentry"],
			["./browser/posthog", "browser-posthog"],
			["./edge/sentry", "edge-sentry"],
			["./edge/posthog", "edge-posthog"],
		] as const) {
			expect(pkg.exports[subpath]?.import).toBe(`./dist/${file}.mjs`);
		}
		expect(pkg.exports["./browser"]).toBeUndefined();
		expect(pkg.exports["./edge"]).toBeUndefined();
	});
});
