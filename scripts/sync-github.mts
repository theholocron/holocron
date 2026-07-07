#!/usr/bin/env tsx
/**
 * Syncs all generated content from holocron into theholocron/.github.
 *
 * holocron is the single source of truth for:
 *   packages/cli/src/templates/actions/**   → .github/.github/actions/**
 *   packages/cli/src/templates/workflows/** → .github/.github/workflows/**
 *   setup-workflows.ts (thin callers)       → .github/workflow-templates/*.yml
 *
 * Community health files, .properties.json metadata, issue templates, and
 * CODEOWNERS remain hand-maintained in .github directly.
 *
 * Usage:
 *   tsx scripts/sync-github.mts <target-root>
 *   target-root: root of a checkout of theholocron/.github
 *
 * Example (CI):
 *   tsx scripts/sync-github.mts ./dotgithub
 */

import { copyFile, mkdir, readdir } from "node:fs/promises";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { writeFile } from "node:fs/promises";

import { WORKFLOW_TEMPLATES } from "../packages/cli/src/commands/setup-workflows.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const TEMPLATES_ROOT = resolve(__dirname, "../packages/cli/src/templates");

const targetRoot = process.argv[2]
	? resolve(process.argv[2])
	: resolve(__dirname, "../dotgithub");

async function copyDir(src: string, dest: string): Promise<number> {
	let count = 0;
	const entries = await readdir(src, { withFileTypes: true });
	for (const entry of entries) {
		const srcPath = join(src, entry.name);
		const destPath = join(dest, entry.name);
		if (entry.isDirectory()) {
			await mkdir(destPath, { recursive: true });
			count += await copyDir(srcPath, destPath);
		} else {
			await mkdir(dirname(destPath), { recursive: true });
			await copyFile(srcPath, destPath);
			console.log(`  copied  ${destPath.replace(targetRoot + "/", "")}`);
			count++;
		}
	}
	return count;
}

let total = 0;

// 1. Composite actions → .github/.github/actions/
console.log("\n── actions ──────────────────────────────────────────");
const actionsOut = join(targetRoot, ".github", "actions");
total += await copyDir(join(TEMPLATES_ROOT, "actions"), actionsOut);

// 2. Reusable workflows → .github/.github/workflows/
console.log("\n── reusable workflows ───────────────────────────────");
const workflowsOut = join(targetRoot, ".github", "workflows");
total += await copyDir(join(TEMPLATES_ROOT, "workflows"), workflowsOut);

// 3. Thin callers → .github/workflow-templates/
console.log("\n── workflow-templates (thin callers) ────────────────");
const templatesOut = join(targetRoot, "workflow-templates");
await mkdir(templatesOut, { recursive: true });
for (const [name, content] of Object.entries(WORKFLOW_TEMPLATES)) {
	const filepath = join(templatesOut, `${name}.yml`);
	await writeFile(filepath, content, "utf8");
	console.log(`  written ${name}.yml`);
	total++;
}

console.log(`\n${total} file(s) synced to ${targetRoot}`);
