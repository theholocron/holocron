import { base } from "../configs/base.js";
import { node } from "../configs/node.js";
import { packageJson } from "../configs/package-json.js";
import { typescript } from "../configs/typescript.js";
import { vitest } from "../configs/vitest.js";
import type { Linter } from "eslint";

export interface LibraryOptions {
	/**
	 * Package (or path) globs whose code runs in the browser, not Node —
	 * `n/no-unsupported-features/node-builtins` false-positives on browser
	 * APIs (`navigator`, `sessionStorage`, `KeyboardEvent`, …) it doesn't
	 * recognize. Each entry gets a `<glob>/**` files match with the rule
	 * turned off. Rare — most repos need nothing here (`theholocron/utils`
	 * is the one org repo that does, for its browser-targeted packages).
	 */
	browserPackages?: string[];
}

/**
 * Every 5-of-6 org repos' `eslint.config.ts` already reduces to `...library()`
 * with no further composition once `base()`'s gitignore/docs-src absorption
 * (#460) is in place — the sixth (`holocron` itself) only differs by also
 * spreading `vitest()` at its root, which is safe to bake in unconditionally
 * here: {@link vitest}'s config is glob-scoped to test/setup files, so it's a
 * no-op anywhere it doesn't match, same reasoning as `docsSrcConfig`. Once
 * every repo drops its now-redundant local composition (#680, the migration
 * pass), `library()` alone — resolved via `eslint --config`, zero committed
 * file — covers every repo but the `browserPackages` outlier, which keeps a
 * tiny `export default library({ browserPackages: [...] })` (config-resolution
 * workstream, #676 in theholocron/holocron).
 */
export function library(options: LibraryOptions = {}): Linter.Config[] {
	return [
		...base(),
		...node(),
		...typescript(),
		...packageJson(),
		...vitest(),
		{
			name: "@theholocron/library",
			rules: {
				// Library packages often include dev scripts with shebangs that aren't
				// bin entries, and CLI entry shebangs are commonly injected by bundlers
				// (e.g. tsdown banner) rather than written in source. The hashbang rule
				// produces false positives in both cases for the library use-case.
				"n/hashbang": "off",
				// tsdown compiles src/ → dist/ and package.json#files lists dist/ only.
				// Every relative src/ import is therefore flagged as unpublished — a
				// universal false positive for the TypeScript src→dist build model.
				"n/no-unpublished-import": "off",
			},
		},
		...(options.browserPackages?.length
			? [
					{
						name: "@theholocron/library/browser-packages",
						files: options.browserPackages.map((pkg) => `${pkg}/**`),
						rules: {
							"n/no-unsupported-features/node-builtins": "off",
						},
					} satisfies Linter.Config,
				]
			: []),
	];
}
