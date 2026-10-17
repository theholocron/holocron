/**
 * Discover and load `<name>.config.*` files, or load one from content that
 * didn't come from a file at all ({@link loadConfigFromContent}).
 * Holocron-agnostic — no schema, no validation, no defaults. Consumers
 * layer those on top.
 *
 * Probe order is **TS-first**: `.ts` → `.js` → `.mjs` → `.cjs` → `.json`.
 * TS is loaded through `tsx`'s `tsImport` (a runtime dependency) so a
 * typed `defineConfig` file works with no build step.
 *
 * `walkUp` (off by default) adds the "nearest config" search
 * cosmiconfig/postcss/stylelint/ESLint's flat config all do: when `cwd`
 * itself has no match, check its parent, then its parent's parent, and so
 * on — stopping at the first directory containing a `.git` entry (checked
 * after that directory's own config probe, so the project root itself is
 * still searched) or the filesystem root. Never wanders past a repo
 * boundary into an unrelated enclosing directory. Built on
 * `@theholocron/fs-utils`'s `findUpward`/`hasGitEntry` — the same
 * upward-walk shape `@theholocron/sentinel`'s own `findPackageRoot` needs,
 * only with a different predicate.
 */

import { findUpward, hasGitEntry } from "@theholocron/fs-utils";

import { DEFAULT_EXTENSIONS } from "../default-extensions/index.js";
import { probeExtensions } from "../probe-extensions/index.js";
import type { LoadConfigFileOptions, Loaded } from "./load-config-file.type.js";

/**
 * Load the first `<name>.config.<ext>` found starting at `cwd` — just
 * `cwd` itself by default, or walking up through ancestor directories when
 * `walkUp` is set (see the module doc comment for the stop conditions).
 * Returns `null` when none is present anywhere searched; throws
 * {@link ConfigFileError} when a file exists but cannot be loaded.
 */
export async function loadConfigFile<T>(opts: LoadConfigFileOptions): Promise<Loaded<T> | null> {
	const extensions = opts.extensions ?? DEFAULT_EXTENSIONS;
	const checkDir = (dir: string) => probeExtensions<T>(dir, opts.name, extensions);

	if (!opts.walkUp) return (await checkDir(opts.cwd)) ?? null;
	return (await findUpward(opts.cwd, checkDir, hasGitEntry)) ?? null;
}
