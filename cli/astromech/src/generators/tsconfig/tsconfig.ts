/**
 * `tsconfig.json` generation — Bucket B (config-resolution workstream, #676):
 * the file must stay committed (the TypeScript language server discovers it
 * directly from disk, no `--config` override mechanism to hand it a path
 * instead), but its content is fully derivable, so it's generated rather
 * than hand-authored — the same category as `.editorconfig`
 * ({@link "../../templates/configs/editorconfig/create-config.js" createConfig})
 * and {@link codecovConfig}.
 *
 * Surveyed every package-level `tsconfig.json` across the org (`holocron`,
 * `clients`, `utils` — 20+ packages). `extends: "@theholocron/tsconfig/
 * node-lts"`, `compilerOptions.baseUrl: "./"`, `compilerOptions.outDir:
 * "./dist"`, `include: ["src/**\/*.ts"]`, and `exclude: ["node_modules",
 * "dist"]` are uniform in every one — safe defaults here. `paths` (a `@/*`
 * → `./src/*` import alias) is a real per-package choice, present in
 * roughly 40% of packages checked — an opt-in parameter, not a default.
 *
 * Two fields checked and deliberately *not* absorbed as defaults, unlike
 * `eslint-config`'s `tsconfigRootDir`/`settings.node` (which turned out
 * redundant with the shared package's own behavior, `configs`#461):
 * `compilerOptions.module`/`moduleResolution` (only `@theholocron/cli`
 * overrides these, to `esnext`/`bundler` — a genuine deviation from the
 * shared `node-lts` preset's `nodenext`/`nodenext`, needed for its bundler
 * tooling, not something every package should inherit) and
 * `compilerOptions.rootDir` (present in exactly two packages, always the
 * same value `./src` that `include` already implies — an unnecessary
 * override wherever it appears, not a pattern worth generalizing).
 *
 * Monorepo *root* `tsconfig.json` (a TS project-references "solution
 * file" — `holocron`'s own root is `{ files: [], references: [...] }`,
 * listing which packages to build) is a structurally different, genuinely
 * per-repo document — out of scope here, same as Bucket C content.
 *
 * Not yet wired into `holocron repo setup`'s per-package write loop (every
 * other Bucket B file there is a single repo-root file, safely
 * overwritten every run — `tsconfig.json` is per-package, and most
 * packages' files still carry real hand-authored content today, not yet
 * migrated to a fully-generated state). That per-package iteration +
 * safe-migration design is `#680`'s job, not duplicated here — this is
 * the generator itself, ready for it to call.
 */

import { stringifyJson } from "@theholocron/json-utils";

import type { TsconfigOptions } from "./tsconfig.type.js";

/**
 * A package-level `tsconfig.json` — the uniform shape confirmed across
 * every package checked, parameterized only by the two fields that
 * genuinely vary (`display`, `paths`). No scaffold/workflow header (matches
 * `.alexrc.json`'s existing precedent for a strict-JSON Bucket B file —
 * JSON has no comment syntax to carry one, and TypeScript's own tolerance
 * for JSONC comments in `tsconfig.json` isn't worth relying on for a file
 * this thin).
 */
export function createTsconfig(options: TsconfigOptions): string {
	const variant = options.variant ?? "node-lts";
	const compilerOptions: Record<string, unknown> = {
		baseUrl: "./",
		outDir: "./dist",
	};
	if (options.paths) {
		compilerOptions.paths = { "@/*": ["./src/*"] };
	}

	const config = {
		display: options.display,
		extends: `@theholocron/tsconfig/${variant}`,
		compilerOptions,
		include: ["src/**/*.ts"],
		exclude: ["node_modules", "dist"],
	};
	return stringifyJson(config);
}
