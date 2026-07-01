/**
 * `holocron.config.{json,js,ts}` file loader.
 *
 * v2.0 only documents the JSON form, but the loader looks up all three
 * extensions in priority order (json → js → ts) — that's the schema
 * commitment captured in [`.notes/tech-architecture.spec.md` → Roadmap
 * → Shareable configs] so the JS/TS preset story (issue #75) can land
 * later without a breaking change.
 *
 * The JS/TS forms aren't actually parsed today; they trigger a clear
 * error telling the operator to use JSON for v2.0. The contract is the
 * lookup order, not the interpretation.
 */

import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";

import type { HolocronConfig, ResolvedHolocronConfig } from "./config.js";
import { ConfigError, resolveConfig } from "./config.js";

const CANDIDATE_FILENAMES = ["holocron.config.json", "holocron.config.js", "holocron.config.ts"] as const;

export class ConfigFileError extends Error {
	override name = "ConfigFileError";
}

export interface LoadedConfig {
	resolved: ResolvedHolocronConfig;
	/** Absolute path to the file the config was read from. */
	filepath: string;
}

/**
 * Read + parse + resolve `holocron.config.*` from the given directory.
 * Search order: json → js → ts. Throws `ConfigFileError` if nothing
 * found, or `ConfigError` if the JSON is malformed / invalid.
 */
export async function loadConfig(cwd: string): Promise<LoadedConfig> {
	for (const filename of CANDIDATE_FILENAMES) {
		const fullPath = join(cwd, filename);
		if (await fileExists(fullPath)) {
			if (filename.endsWith(".json")) {
				return { resolved: await loadJson(fullPath), filepath: fullPath };
			}
			throw new ConfigFileError(
				`${filename} found, but v2.0 only supports the JSON form. ` +
					`Rename to holocron.config.json. The JS/TS form lands with the preset feature (see issue #75).`
			);
		}
	}
	throw new ConfigFileError(
		`no holocron.config.{json,js,ts} found in ${cwd}. Create one — see the README for the schema.`
	);
}

async function loadJson(filepath: string): Promise<ResolvedHolocronConfig> {
	const raw = await readFile(filepath, "utf8");
	let parsed: HolocronConfig;
	try {
		parsed = JSON.parse(raw) as HolocronConfig;
	} catch (err) {
		throw new ConfigError(`${filepath} is not valid JSON: ${err instanceof Error ? err.message : String(err)}`);
	}
	return resolveConfig(parsed);
}

async function fileExists(path: string): Promise<boolean> {
	try {
		const s = await stat(path);
		return s.isFile();
	} catch {
		return false;
	}
}
