#!/usr/bin/env node
/**
 * Validates that every public package in cli/ or plugins/ has a
 * registry entry in @theholocron/registry-doc.
 *
 * Usage: node scripts/validate-registry.mjs
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { getRegistry } from "@theholocron/registry-doc";

const root = fileURLToPath(new URL("..", import.meta.url));

function publicPackagesIn(dir) {
	if (!existsSync(dir)) return [];
	const names = [];
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		if (!entry.isDirectory()) continue;
		try {
			const pkg = JSON.parse(readFileSync(join(dir, entry.name, "package.json"), "utf8"));
			if (!pkg.private && typeof pkg.name === "string") {
				names.push(pkg.name);
			}
		} catch {
			// no package.json — skip
		}
	}
	return names;
}

// Collect public package names from this workspace.
const publicPackages = [...publicPackagesIn(join(root, "cli")), ...publicPackagesIn(join(root, "plugins"))];

if (publicPackages.length === 0) {
	console.log("No public packages found — nothing to validate.");
	process.exit(0);
}

// Check every public package has a registry entry.
const registered = new Set(Object.values(getRegistry()).map((e) => e.package));
const missing = publicPackages.filter((p) => !registered.has(p));

console.log(`\nValidating ${publicPackages.length} public package(s) against registry…\n`);

if (missing.length > 0) {
	console.error(`${missing.length} package(s) missing from @theholocron/registry-doc:\n`);
	for (const p of missing) {
		console.error(`  ${p}`);
	}
	console.error(`\nAdd the missing entries to the registry in theholocron/docs.`);
	process.exit(1);
}

console.log(`All ${publicPackages.length} package(s) are registered. ✓`);
