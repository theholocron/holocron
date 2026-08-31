#!/usr/bin/env node
/**
 * Warns when a PR adds a new public package without a corresponding docs change.
 *
 * Heuristic:
 * - Triggers on new packages/*/src/index.ts where package.json has no "private: true"
 * - A docs change = any file changed under docs/ or matching *.md / *.mdx
 * - Exits 0 (warning only) so it never blocks emergency fixes
 *
 * Usage: node scripts/validate-docs-presence.mjs
 * Env:   BASE_SHA — base commit SHA to diff against (defaults to HEAD~1)
 */

import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const baseSha = process.env["BASE_SHA"] ?? "HEAD~1";

function git(args) {
	return execSync(`git ${args}`, { cwd: root, encoding: "utf8" }).trim();
}

// Files added in this PR
let addedFiles;
try {
	addedFiles = git(`diff --name-only --diff-filter=A ${baseSha} HEAD`).split("\n").filter(Boolean);
} catch {
	console.log("Could not determine changed files — skipping docs-presence check.");
	process.exit(0);
}

// All changed files (for the docs-change check)
const allChanged = git(`diff --name-only ${baseSha} HEAD`).split("\n").filter(Boolean);

// New public packages: added packages/*/src/index.ts where package is not private
const newPackages = [];
for (const file of addedFiles) {
	const match = file.match(/^packages\/([^/]+)\/src\/index\.ts$/);
	if (!match) continue;
	const pkgName = match[1];
	const pkgJsonPath = join(root, "packages", pkgName, "package.json");
	if (!existsSync(pkgJsonPath)) continue;
	try {
		const pkg = JSON.parse(readFileSync(pkgJsonPath, "utf8"));
		if (!pkg.private) newPackages.push(pkgName);
	} catch {
		// skip
	}
}

if (newPackages.length === 0) {
	console.log("No new public packages — docs-presence check passed.");
	process.exit(0);
}

// Check for any docs change in the PR
const hasDocsChange = allChanged.some(
	(f) => f.startsWith("docs/") || f.endsWith(".md") || f.endsWith(".mdx")
);

console.log(`\nNew public package(s): ${newPackages.join(", ")}`);

if (!hasDocsChange) {
	console.warn(`
⚠  Docs-presence warning: new package(s) added without a docs change.

   New packages: ${newPackages.join(", ")}

   Add a docs page under docs/ in this PR, or open a scoped follow-up PR
   immediately after — docs should ship with the feature.
`);
	// Exit 0 — warning only, does not block the PR.
	process.exit(0);
}

console.log("Docs change detected — docs-presence check passed.");
