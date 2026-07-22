/**
 * `holocron.config.{json,js,ts}` file loader.
 *
 * Search order: json → js → ts. JSON is parsed directly; JS is loaded
 * via native dynamic import; TS is loaded via `tsImport` from tsx (a
 * runtime dep) so operators can write typed configs with `defineConfig`
 * without needing a separate build step.
 *
 * All three forms are validated through the same `resolveConfig` path.
 * Implements the lookup-order contract from issue #75 / #81.
 */

import { execFile } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

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
 * found, or `ConfigError` if the config is malformed / invalid.
 */
export async function loadConfig(cwd: string): Promise<LoadedConfig> {
	for (const filename of CANDIDATE_FILENAMES) {
		const fullPath = join(cwd, filename);
		if (await fileExists(fullPath)) {
			if (filename.endsWith(".json")) {
				return { resolved: await loadJson(fullPath), filepath: fullPath };
			}
			if (filename.endsWith(".ts")) {
				return { resolved: await loadTs(fullPath), filepath: fullPath };
			}
			return { resolved: await loadJs(fullPath), filepath: fullPath };
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
	return resolveConfig(await deriveDefaults(dirname(filepath), parsed));
}

async function loadJs(filepath: string): Promise<ResolvedHolocronConfig> {
	const mod = await import(pathToFileURL(filepath).href);
	return resolveConfig(await deriveDefaults(dirname(filepath), extractRaw(filepath, mod)));
}

async function loadTs(filepath: string): Promise<ResolvedHolocronConfig> {
	const { tsImport } = await import("tsx/esm/api");
	const mod = await tsImport(pathToFileURL(filepath).href, import.meta.url);
	return resolveConfig(await deriveDefaults(dirname(filepath), extractRaw(filepath, mod)));
}

function extractRaw(filepath: string, mod: unknown): HolocronConfig {
	const outer = (mod as { default?: unknown }).default;
	// tsx CJS-transforms `export default x` into `exports.default = x`, which
	// dynamic import wraps as { default: { __esModule: true, default: x } }.
	// Unwrap the extra layer when present so both ESM and CJS outputs work.
	const raw =
		(outer as { __esModule?: boolean })?.__esModule === true ? (outer as { default?: unknown }).default : outer;
	if (raw === undefined || raw === null) {
		throw new ConfigFileError(`${filepath} must have a default export (use \`export default defineConfig({…})\`)`);
	}
	return raw as HolocronConfig;
}

async function deriveDefaults(configDir: string, raw: HolocronConfig): Promise<HolocronConfig> {
	const result = { ...raw };
	if (!result.name) {
		result.name = (await readPackageJsonName(configDir)) ?? basename(configDir);
	}
	if (result.repo && !result.repo.name) {
		const repoName = await readGitRemote(configDir);
		if (repoName) result.repo = { ...result.repo, name: repoName };
	}
	return result;
}

async function readPackageJsonName(dir: string): Promise<string | undefined> {
	try {
		const content = await readFile(join(dir, "package.json"), "utf8");
		const pkg = JSON.parse(content) as { name?: string };
		return typeof pkg.name === "string" ? pkg.name.replace(/^@[^/]+\//, "") : undefined;
	} catch {
		return undefined;
	}
}

async function readGitRemote(dir: string): Promise<string | undefined> {
	try {
		const { stdout } = await execFileAsync("git", ["remote", "get-url", "origin"], { cwd: dir });
		return parseGitRemoteUrl(stdout.trim());
	} catch {
		return undefined;
	}
}

function parseGitRemoteUrl(url: string): string | undefined {
	const httpsMatch = url.match(/github\.com\/([^/]+\/[^/]+?)(?:\.git)?$/);
	if (httpsMatch) return httpsMatch[1]!;
	const sshMatch = url.match(/github\.com:([^/]+\/[^/]+?)(?:\.git)?$/);
	if (sshMatch) return sshMatch[1]!;
	return undefined;
}

async function fileExists(path: string): Promise<boolean> {
	try {
		const s = await stat(path);
		return s.isFile();
	} catch {
		return false;
	}
}
