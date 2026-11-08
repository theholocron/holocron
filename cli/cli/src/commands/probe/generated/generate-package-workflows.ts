import { existsSync } from "node:fs";
import { join } from "node:path";

import { readWorkspacePackages } from "@theholocron/astromech";

import { loadConfig } from "../../../config/index.js";
import { type GeneratedWorkflowFile, generateWorkflowFiles } from "../../repo-files/index.js";
import type { PackageGenerated } from "./check-generated.js";

/** The extensions a `holocron.config` can have. */
const CONFIG_EXTENSIONS = ["ts", "js", "mjs", "cjs", "json"];

/** What `generatePackageWorkflows` found: the workflows of each package, and why a package's could not be made. */
export interface PackageWorkflows {
	/** The packages with a config of their own, in workspace order. */
	packages: PackageGenerated[];
	/** One line per package whose config could not be loaded or turned into workflows. */
	errors: string[];
}

function files(entries: ReturnType<typeof generateWorkflowFiles>): GeneratedWorkflowFile[] {
	return entries.filter((e): e is GeneratedWorkflowFile => e.kind === "file");
}

/**
 * The thin-caller workflows of every workspace package that has a `holocron.config.*` of its own (`apps/sentinel`),
 * each generated twice by the function `holocron repo sync --cwd <package>` writes them with. The root's own config
 * is not here. A package whose config cannot be loaded is reported in `errors`, not skipped.
 */
export async function generatePackageWorkflows(repoRoot: string): Promise<PackageWorkflows> {
	const result: PackageWorkflows = { packages: [], errors: [] };
	for (const pkg of readWorkspacePackages(repoRoot)) {
		const path = pkg.path ?? `${pkg.dir}/${pkg.slug}`;
		const dir = join(repoRoot, path);
		if (!CONFIG_EXTENSIONS.some((ext) => existsSync(join(dir, `holocron.config.${ext}`)))) continue;
		try {
			const loaded = await loadConfig(dir);
			const input = { loaded, repoRoot: dir };
			result.packages.push({
				path,
				files: files(generateWorkflowFiles(input)),
				again: files(generateWorkflowFiles(input)),
			});
		} catch (error) {
			result.errors.push(`${path}: could not generate its workflows: ${(error as Error).message}`);
		}
	}
	return result;
}
