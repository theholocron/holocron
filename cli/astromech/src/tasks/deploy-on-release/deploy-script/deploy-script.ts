import { join } from "node:path";

import { DEPLOY_SCRIPT, LEGACY_DEPLOY_SCRIPT } from "../constants.js";
import type { Tree } from "../workspace-packages/index.js";

/** The `scripts` of the `package.json` in `dir`; empty when it has none or cannot be read. */
function scriptsOf(readJson: Tree["readJson"], dir: string): Record<string, unknown> {
	try {
		return (
			(readJson(join(dir, "package.json")) as { scripts?: Record<string, unknown> } | undefined)?.scripts ?? {}
		);
	} catch {
		return {};
	}
}

/**
 * The script a release-time deploy runs in the package at `dir`: `deploy`, or the old `delivery.deploy` when that
 * is the only one it has. A package with neither, or one whose `package.json` cannot be read, gets `deploy`, so
 * the failure names the script the package is expected to have.
 */
export function deployScript(readJson: Tree["readJson"], dir: string): string {
	const scripts = scriptsOf(readJson, dir);
	return !(DEPLOY_SCRIPT in scripts) && LEGACY_DEPLOY_SCRIPT in scripts ? LEGACY_DEPLOY_SCRIPT : DEPLOY_SCRIPT;
}
