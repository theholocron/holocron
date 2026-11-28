import { existsSync } from "node:fs";
import { join } from "node:path";

import { readWorkspacePackages } from "@theholocron/astromech";
import { errorMessage } from "@theholocron/misc-utils";

import { loadConfig } from "../../config/index.js";
import type { WorkspaceConfig } from "./workspace-configs.type.js";

/** The extensions a `holocron.config` can have. */
const CONFIG_EXTENSIONS = ["ts", "js", "mjs", "cjs", "json"];

/**
 * The config of every workspace package that has a `holocron.config.*` of its own (`apps/sentinel`, `apps/comlink`), in
 * workspace order. A package whose config cannot be loaded is still listed, with the reason, so a caller decides whether
 * leaving it out is safe (`workspaceProviders()` does, `readWorkspaceMonitoring()` does not). Where the workspace itself
 * cannot be read (no `pnpm-workspace.yaml`, a bad one) there are none. Nothing is written and no provider is loaded.
 */
export async function readWorkspaceConfigs(repoRoot: string): Promise<WorkspaceConfig[]> {
	let packages: ReturnType<typeof readWorkspacePackages>;
	try {
		packages = readWorkspacePackages(repoRoot);
	} catch {
		return [];
	}
	const found: WorkspaceConfig[] = [];
	for (const pkg of packages) {
		const path = pkg.path ?? `${pkg.dir}/${pkg.slug}`;
		const dir = join(repoRoot, path);
		if (!CONFIG_EXTENSIONS.some((ext) => existsSync(join(dir, `holocron.config.${ext}`)))) continue;
		try {
			found.push({ path, dir, resolved: (await loadConfig(dir)).resolved });
		} catch (err) {
			found.push({ path, dir, error: errorMessage(err) });
		}
	}
	return found;
}
