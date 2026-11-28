import { readFileSync } from "node:fs";
import { join } from "node:path";

import { codecovFlagNames, packageLocation, readWorkspacePackages } from "@theholocron/astromech";

import type { CoverageConfigFilesInput } from "./coverage-config-files.type.js";

/** The text of a file in the repository, or `null` when it is not there or cannot be read. */
function readExisting(repoRoot: string, path: string): string | null {
	try {
		return readFileSync(join(repoRoot, path), "utf8");
	} catch {
		return null;
	}
}

/**
 * The config files the repo's `coverage` provider writes (`Coverage.configFiles()`, `codecov.yml` for Codecov), as a
 * function that makes them, so a failure in the provider is the caller's to report as a failed step and not a crash
 * before anything is written. The task runner imports no provider, so this is where the workspace is read and handed in:
 * the packages as components and flags, the docs mode and a reader for the file already there (to merge into it).
 * `undefined` when no `coverage` provider is loaded or it does not implement the method: `generateRepoFiles()` then
 * writes no coverage config, which is what a run with no provider does. Names and file text only.
 */
export function coverageConfigFiles(input: CoverageConfigFilesInput): (() => Record<string, string>) | undefined {
	if (!input.loader.has("coverage")) return undefined;
	const provider = input.loader.get("coverage");
	if (provider.configFiles === undefined) return undefined;
	const documentation = input.docsCoverage ?? "off";
	return () => {
		const packages = readWorkspacePackages(input.repoRoot);
		return provider.configFiles!({
			components: packages.map((pkg) => ({ id: pkg.slug, path: packageLocation(pkg) })),
			flags: codecovFlagNames(packages),
			documentation,
			existing: (path) => readExisting(input.repoRoot, path),
		});
	};
}
