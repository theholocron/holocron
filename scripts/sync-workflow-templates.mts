#!/usr/bin/env tsx
/**
 * Syncs thin workflow caller templates from setup-workflows.ts into the
 * theholocron/.github repo's workflow-templates/ directory.
 *
 * setup-workflows.ts is the single source of truth for what a thin caller
 * looks like. This script keeps workflow-templates/ (the GitHub Starter
 * Workflow UI) in sync so users who adopt a template get the same content
 * that `holocron setup` would write.
 *
 * Usage: tsx scripts/sync-workflow-templates.mts <target-dir>
 *   target-dir: path to workflow-templates/ in a checkout of theholocron/.github
 */

import { writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { WORKFLOW_TEMPLATES } from "../packages/cli/src/commands/setup-workflows.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

const targetDir = process.argv[2]
	? resolve(process.argv[2])
	: resolve(__dirname, "../workflow-templates");

let synced = 0;

for (const [name, content] of Object.entries(WORKFLOW_TEMPLATES)) {
	const filepath = join(targetDir, `${name}.yml`);
	await writeFile(filepath, content, "utf8");
	console.log(`  synced ${name}.yml`);
	synced++;
}

console.log(`\n${synced} template(s) written to ${targetDir}`);
