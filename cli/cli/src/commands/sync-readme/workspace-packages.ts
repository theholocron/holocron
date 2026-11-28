import { discoverWorkspacePackages } from "@theholocron/pkg-utils";

import type { PackagesRegistry } from "./generate-readme.type.js";

const NPM_BASE = "https://www.npmjs.com/package";

/**
 * The public packages of the repo's workspace, as the rows of the README's
 * packages table: the name, its `homepage` as the docs link, and its npm page.
 *
 * `undefined` when the workspace has no public package (a single-package repo
 * has no table to show).
 */
export function workspacePackages(
	repoRoot: string,
	discover: typeof discoverWorkspacePackages = discoverWorkspacePackages
): PackagesRegistry | undefined {
	const rows = discover(repoRoot)
		.flatMap(({ name, manifest }) =>
			name && !manifest.private
				? [{ name, homepage: typeof manifest.homepage === "string" ? manifest.homepage : "" }]
				: []
		)
		.sort((a, b) => a.name.localeCompare(b.name));
	if (rows.length === 0) return undefined;
	return Object.fromEntries(
		rows.map(({ name, homepage }) => [name, { package: name, docsUrl: homepage, npmUrl: `${NPM_BASE}/${name}` }])
	);
}
