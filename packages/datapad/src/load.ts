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

import { writeFile } from "node:fs/promises";
import { join } from "node:path";

import { findUpward, hasGitEntry } from "@theholocron/fs-utils";
import { deepMerge as mergeConfig } from "@theholocron/object-utils";

import { isFile, loadFile } from "./utils.js";

/** Default extension probe order, highest priority first. */
export const DEFAULT_EXTENSIONS = ["ts", "js", "mjs", "cjs", "json"] as const;

export interface LoadConfigFileOptions {
	/** Directory to start looking in. */
	cwd: string;
	/** Base name — `"holocron"` resolves `holocron.config.{ts,js,mjs,cjs,json}`. */
	name: string;
	/** Override the extension probe order. */
	extensions?: readonly string[];
	/**
	 * Walk upward through ancestor directories when `cwd` itself has no
	 * match, stopping at the first directory containing a `.git` entry (that
	 * directory is still searched before stopping) or the filesystem root.
	 * Off by default — exact-`cwd`-only, unchanged behavior for any existing
	 * caller that doesn't pass this.
	 */
	walkUp?: boolean;
}

export interface Loaded<T> {
	config: T;
	/** Absolute path of the file the value came from. */
	filepath: string;
}

/**
 * Probe `dir` for `<name>.config.<ext>` in extension-priority order,
 * loading and returning the first match. The one piece of per-directory
 * orchestration `loadConfigFile` needs on both its non-walking and
 * walking paths — pulled out so it can be unit-tested directly instead of
 * only through `loadConfigFile`'s full probe/walk behavior.
 */
export async function probeExtensions<T>(
	dir: string,
	name: string,
	extensions: readonly string[]
): Promise<Loaded<T> | undefined> {
	for (const ext of extensions) {
		const filepath = join(dir, `${name}.config.${ext}`);
		if (!(await isFile(filepath))) continue;
		return { config: await loadFile<T>(filepath, ext), filepath };
	}
	return undefined;
}

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

export interface LoadLayeredOptions extends LoadConfigFileOptions {
	/**
	 * When no dedicated `<name>.config.*` exists — or in addition to it —
	 * read `<file>.config.*` and take its `[key]`. The dedicated file (if
	 * any) is merged on top.
	 */
	fallback?: { file: string; key: string };
}

export interface LayeredResult<T> {
	config: T;
	/** The dedicated file path if present, else the fallback file path, else `null`. */
	filepath: string | null;
	/** Absolute paths actually merged, lowest priority first. */
	sources: string[];
}

/**
 * `<name>.config.*` layered over the `[fallback.key]` of
 * `<fallback.file>.config.*`. Either, both, or neither may be present;
 * the dedicated file wins on conflict (vitest-over-vite). Returns `null`
 * when neither source resolves.
 */
export async function loadLayered<T>(opts: LoadLayeredOptions): Promise<LayeredResult<T> | null> {
	const dedicated = await loadConfigFile<T>(opts);

	let base: unknown;
	let baseFile: string | null = null;
	if (opts.fallback) {
		const parent = await loadConfigFile<Record<string, unknown>>({
			cwd: opts.cwd,
			name: opts.fallback.file,
			extensions: opts.extensions,
			walkUp: opts.walkUp,
		});
		if (parent && parent.config[opts.fallback.key] !== undefined) {
			base = parent.config[opts.fallback.key];
			baseFile = parent.filepath;
		}
	}

	if (!dedicated && base === undefined) return null;

	const config = mergeConfig(base as T, dedicated?.config);
	const sources = [baseFile, dedicated?.filepath ?? null].filter((s): s is string => s !== null);
	return { config, filepath: dedicated?.filepath ?? baseFile, sources };
}

export interface LoadConfigFromContentOptions {
	/**
	 * Directory to write `<name>.config.<extension>` into before loading —
	 * this is what upward `node_modules` resolution sees, so a config that
	 * does `import { defineConfig } from "@theholocron/cli"` only resolves
	 * if `dir` sits under a tree where that package is a real dependency.
	 * Callers own creating and cleaning up `dir` — this function only
	 * writes the one file into it.
	 */
	dir: string;
	/** Raw file content — not necessarily sourced from a local file at all (a network fetch, a git blob, …). */
	content: string;
	/** Base name — `"holocron"` writes `holocron.config.<extension>`. */
	name: string;
	/** Which of `DEFAULT_EXTENSIONS` `content` is — determines how it's interpreted (ts/js/mjs/cjs parsed as a module, json as `JSON.parse`). */
	extension: string;
}

/**
 * Load config from content that didn't come from a file already on disk —
 * writes it to `<dir>/<name>.config.<extension>` first, then loads it
 * through the exact same path {@link loadConfigFile} uses for a file it
 * discovered itself. Exists because sourcing config content from somewhere
 * other than the local filesystem (a GitHub API fetch, for one — see
 * `@theholocron/sentinel`) doesn't change what loading it correctly means:
 * a `.ts` config still needs real module resolution, `defineConfig` import
 * included, not a re-implemented parser.
 */
export async function loadConfigFromContent<T>(opts: LoadConfigFromContentOptions): Promise<Loaded<T>> {
	const filepath = join(opts.dir, `${opts.name}.config.${opts.extension}`);
	await writeFile(filepath, opts.content, "utf8");
	return { config: await loadFile<T>(filepath, opts.extension), filepath };
}
