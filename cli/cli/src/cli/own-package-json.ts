import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { findRootSync } from "@theholocron/fs-utils";

/**
 * The `name` and `version` of the package that `moduleUrl` belongs to, from the nearest `package.json` above it.
 * That is the package root whether the CLI runs from source (`src/cli/cli.ts`, through tsx) or built (`dist/cli.mjs`),
 * which a fixed `../package.json` would not be: the entry sits one folder deeper in source than it does built.
 */
export function ownPackageJson(moduleUrl: string): { name: string; version: string } {
	const from = dirname(fileURLToPath(moduleUrl));
	const root = findRootSync(from, "package.json");
	if (!root) throw new Error(`no package.json found above ${from}`);
	return JSON.parse(readFileSync(join(root, "package.json"), "utf-8")) as { name: string; version: string };
}
