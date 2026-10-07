/**
 * The actual file-loading mechanics `load.ts`'s exported functions share:
 * JSON parsing, dynamic `import()` (TS via `tsx`'s persistent ESM loader,
 * JS/MJS/CJS natively), and unwrapping the CJS/ESM default-export
 * double-wrap `tsx`'s transform produces. Kept separate from `load.ts`'s
 * own orchestration (which directory, which extension order, upward
 * search) — this file only knows "given one exact filepath and
 * extension, load it," always throwing {@link ConfigFileError} on failure.
 */

import { readFile, stat } from "node:fs/promises";
import { pathToFileURL } from "node:url";

import { errorMessage } from "@theholocron/misc-utils";

import { ConfigFileError } from "./errors.js";

export async function loadFile<T>(filepath: string, ext: string): Promise<T> {
	if (ext === "json") return loadJson<T>(filepath);
	const mod = ext === "ts" ? await importTs(filepath) : await importModule(filepath);
	return extractDefault<T>(filepath, mod);
}

async function loadJson<T>(filepath: string): Promise<T> {
	// The caller has already confirmed the file exists; a read failure here
	// is a genuine race — let it surface as-is.
	const text = await readFile(filepath, "utf8");
	try {
		return JSON.parse(text) as T;
	} catch (err) {
		throw new ConfigFileError(`${filepath} is not valid JSON: ${errorMessage(err)}`, filepath);
	}
}

async function importModule(filepath: string): Promise<unknown> {
	try {
		return (await import(pathToFileURL(filepath).href)) as unknown;
	} catch (err) {
		throw new ConfigFileError(`could not load ${filepath}: ${errorMessage(err)}`, filepath);
	}
}

let tsRegistered: Promise<void> | undefined;

async function registerTsx(): Promise<void> {
	const { register } = await import("tsx/esm/api");
	register();
}

/**
 * Load a `.ts` file. `tsx`'s ESM loader is registered once per process
 * (lazily — only when a `.ts` file is actually loaded). `register()` is
 * used over `tsImport()` because a single run may load several TS files
 * (`loadLayered` reads a dedicated file *and* a parent file) and
 * `tsImport`'s one-off register/unregister cycle is not reentrant.
 */
async function importTs(filepath: string): Promise<unknown> {
	tsRegistered ??= registerTsx();
	await tsRegistered;
	try {
		return (await import(pathToFileURL(filepath).href)) as unknown;
	} catch (err) {
		throw new ConfigFileError(`could not load ${filepath}: ${errorMessage(err)}`, filepath);
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

export async function isFile(path: string): Promise<boolean> {
	try {
		return (await stat(path)).isFile();
	} catch {
		return false;
	}
}
