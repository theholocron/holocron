/**
 * Discover and load `<name>.config.*` files. Holocron-agnostic — no
 * schema, no validation, no defaults. Consumers layer those on top.
 *
 * Probe order is **TS-first**: `.ts` → `.js` → `.mjs` → `.cjs` → `.json`.
 * TS is loaded through `tsx`'s `tsImport` (a runtime dependency) so a
 * typed `defineConfig` file works with no build step.
 */

import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { ConfigFileError } from "./errors.js";
import { mergeConfig } from "./merge.js";

/** Default extension probe order, highest priority first. */
export const DEFAULT_EXTENSIONS = ["ts", "js", "mjs", "cjs", "json"] as const;

export interface LoadConfigFileOptions {
	/** Directory to look in. */
	cwd: string;
	/** Base name — `"holocron"` resolves `holocron.config.{ts,js,mjs,cjs,json}`. */
	name: string;
	/** Override the extension probe order. */
	extensions?: readonly string[];
}

export interface Loaded<T> {
	config: T;
	/** Absolute path of the file the value came from. */
	filepath: string;
}

/**
 * Load the first `<name>.config.<ext>` that exists in `cwd`. Returns
 * `null` when none is present; throws {@link ConfigFileError} when a file
 * exists but cannot be loaded.
 */
export async function loadConfigFile<T>(opts: LoadConfigFileOptions): Promise<Loaded<T> | null> {
	const extensions = opts.extensions ?? DEFAULT_EXTENSIONS;
	for (const ext of extensions) {
		const filepath = join(opts.cwd, `${opts.name}.config.${ext}`);
		if (!(await isFile(filepath))) continue;
		return { config: await loadFile<T>(filepath, ext), filepath };
	}
	return null;
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

// ── loading ──────────────────────────────────────────────────────────────────

async function loadFile<T>(filepath: string, ext: string): Promise<T> {
	if (ext === "json") return loadJson<T>(filepath);
	const mod = ext === "ts" ? await importTs(filepath) : await importModule(filepath);
	return extractDefault<T>(filepath, mod);
}

async function loadJson<T>(filepath: string): Promise<T> {
	let text: string;
	try {
		text = await readFile(filepath, "utf8");
	} catch (err) {
		throw new ConfigFileError(`could not read ${filepath}: ${message(err)}`, filepath);
	}
	try {
		return JSON.parse(text) as T;
	} catch (err) {
		throw new ConfigFileError(`${filepath} is not valid JSON: ${message(err)}`, filepath);
	}
}

async function importModule(filepath: string): Promise<unknown> {
	try {
		return (await import(pathToFileURL(filepath).href)) as unknown;
	} catch (err) {
		throw new ConfigFileError(`could not load ${filepath}: ${message(err)}`, filepath);
	}
}

let tsRegistered: Promise<void> | undefined;

/**
 * Register `tsx`'s ESM loader once per process (lazily — only when a `.ts`
 * config is actually loaded), then load through a plain dynamic import.
 * `register()` is used over `tsImport()` because a single run may load
 * several TS configs (`loadLayered` reads a dedicated file *and* a parent
 * file) and `tsImport`'s one-off register/unregister cycle is not
 * reentrant.
 */
async function importTs(filepath: string): Promise<unknown> {
	if (!tsRegistered) {
		tsRegistered = import("tsx/esm/api")
			.then(({ register }) => {
				register();
			})
			.catch((err: unknown) => {
				tsRegistered = undefined;
				throw new ConfigFileError(`tsx is required to load ${filepath}: ${message(err)}`, filepath);
			});
	}
	await tsRegistered;
	try {
		return (await import(pathToFileURL(filepath).href)) as unknown;
	} catch (err) {
		throw new ConfigFileError(`could not load ${filepath}: ${message(err)}`, filepath);
	}
}

/**
 * Unwrap `export default`. `tsx` CJS-transforms `export default x` into
 * `exports.default = x`, which dynamic import wraps as
 * `{ default: { __esModule: true, default: x } }` — strip the extra layer
 * when present so ESM and CJS outputs both resolve.
 */
function extractDefault<T>(filepath: string, mod: unknown): T {
	const outer = (mod as { default?: unknown }).default;
	const raw =
		(outer as { __esModule?: boolean } | undefined)?.__esModule === true
			? (outer as { default?: unknown }).default
			: outer;
	if (raw === undefined || raw === null) {
		throw new ConfigFileError(
			`${filepath} must have a default export (use \`export default defineConfig({…})\`)`,
			filepath
		);
	}
	return raw as T;
}

async function isFile(path: string): Promise<boolean> {
	try {
		return (await stat(path)).isFile();
	} catch {
		return false;
	}
}

const message = (err: unknown): string => (err instanceof Error ? err.message : String(err));
