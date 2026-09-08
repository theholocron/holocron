/**
 * `holocron.config.{ts,js,mjs,cjs,json}` loader.
 *
 * File discovery + module loading (typed configs via `tsx`, no build
 * step) is delegated to `@theholocron/datapad`. This module keeps the
 * holocron-specific parts: filling `name` / `repo.name` defaults and
 * running the config through `resolveConfig`.
 *
 * Probe order is TS-first (`.ts` → `.js` → `.mjs` → `.cjs` → `.json`) —
 * see ADR-0010 / issue #75 / #81.
 */

import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { promisify } from "node:util";

import { ConfigFileError, loadConfigFile } from "@theholocron/datapad";

const execFileAsync = promisify(execFile);

import type { HolocronConfig, ResolvedHolocronConfig } from "./config.js";
import { resolveConfig } from "./config.js";

export { ConfigFileError } from "@theholocron/datapad";

export interface LoadedConfig {
	resolved: ResolvedHolocronConfig;
	/** Absolute path to the file the config was read from. */
	filepath: string;
}

/**
 * Read + parse + resolve `holocron.config.*` from the given directory.
 * Throws {@link ConfigFileError} when nothing is found or a file cannot
 * be loaded, or `ConfigError` when the config is invalid.
 */
export async function loadConfig(cwd: string): Promise<LoadedConfig> {
	const found = await loadConfigFile<HolocronConfig>({ cwd, name: "holocron" });
	if (!found) {
		throw new ConfigFileError(
			`no holocron.config.{ts,js,mjs,cjs,json} found in ${cwd}. Create one — see the README for the schema.`
		);
	}
	const withDefaults = await deriveDefaults(dirname(found.filepath), found.config);
	return { resolved: resolveConfig(withDefaults), filepath: found.filepath };
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
