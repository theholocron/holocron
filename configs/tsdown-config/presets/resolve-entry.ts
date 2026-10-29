import { resolve } from "node:path";

import type { UserConfig } from "tsdown";

/**
 * tsdown resolves a config's relative paths — `entry` and, confirmed the
 * same way (clients#376's release: every package but `http-client`, the
 * one that still kept its own local `tsdown.config.ts`, published with an
 * empty `dist/` — the real build output landed in
 * `node_modules/@theholocron/tsdown-config/dist/presets/dist/` instead),
 * `outDir` too — against the config file's own directory, not the invoking
 * `cwd`. Fine for a package's own local `tsdown.config.ts` (same directory
 * as `src/`), but wrong the moment `--config` points at this shared
 * preset's own location deep in `node_modules` (astromech's
 * config-resolution mechanism, holocron#749/#750/#680 — that's exactly how
 * `entry`'s own version of this first surfaced, migrating a real repo off
 * its local file; `outDir` was never given the same treatment, and the
 * build silently "succeeded" — real file sizes, real log output — while
 * writing everything to a phantom location no `npm publish` would ever
 * pack). An absolute path sidesteps the ambiguity entirely, in both cases:
 * `process.cwd()` is always the actual package directory tsdown was
 * invoked from, regardless of where the config *module* lives on disk.
 *
 * Only `string` and `string[]` are resolved — the only shapes any preset
 * here (or any known consumer's override) actually passes. tsdown's own
 * `entry` type also allows a `Record<string, string | string[]>` (named
 * multi-entry builds) and glob negation patterns (`!foo`); neither is used
 * anywhere in this org today, so both pass through unresolved rather than
 * guessing at a generalization nothing yet exercises.
 */
export function resolveEntry(entry: UserConfig["entry"]): UserConfig["entry"] {
	if (typeof entry === "string") return resolve(process.cwd(), entry);
	if (Array.isArray(entry) && entry.every((e) => typeof e === "string")) {
		return entry.map((e) => resolve(process.cwd(), e));
	}
	return entry;
}

/** Same fix as {@link resolveEntry}, for the single-string `outDir` option. */
export function resolveOutDir(outDir: string): string {
	return resolve(process.cwd(), outDir);
}
