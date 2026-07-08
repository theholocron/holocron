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

import { mkdir, readdir, readFile } from "node:fs/promises";
import { join, resolve, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { writeFile } from "node:fs/promises";

import { WORKFLOW_TEMPLATES } from "../packages/cli/src/commands/setup-workflows.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");
const TEMPLATES_ROOT = resolve(REPO_ROOT, "packages/cli/src/templates");
const SYNC_TIMESTAMP = new Date().toISOString();

const targetRoot = process.argv[2]
	? resolve(process.argv[2])
	: resolve(__dirname, "../dotgithub");

/** Prepend a generated-file header to YAML content. */
function addHeader(content: string, sourcePath: string): string {
	const rel = relative(REPO_ROOT, sourcePath);
	const header = [
		`# AUTO-GENERATED — do not edit in theholocron/.github directly.`,
		`# Source:  theholocron/holocron · ${rel}`,
		`# Synced:  ${SYNC_TIMESTAMP}`,
		`# Tool:    scripts/sync-github.mts`,
		`# Changes: edit source in theholocron/holocron and push to alpha or main.`,
		``,
	].join("\n");
	return header + content;
}

/** Prepend a generated-file header to thin-caller YAML content. */
function addThinCallerHeader(content: string): string {
	const header = [
		`# AUTO-GENERATED — do not edit in theholocron/.github directly.`,
		`# Source:  theholocron/holocron · packages/cli/src/commands/setup-workflows.ts`,
		`# Synced:  ${SYNC_TIMESTAMP}`,
		`# Tool:    scripts/sync-github.mts`,
		`# Changes: edit setup-workflows.ts in theholocron/holocron and push.`,
		``,
	].join("\n");
	return header + content;
}

async function syncDir(src: string, dest: string): Promise<number> {
	let count = 0;
	const entries = await readdir(src, { withFileTypes: true });
	for (const entry of entries) {
		const srcPath = join(src, entry.name);
		const destPath = join(dest, entry.name);
		if (entry.isDirectory()) {
			await mkdir(destPath, { recursive: true });
			count += await syncDir(srcPath, destPath);
		} else {
			await mkdir(dirname(destPath), { recursive: true });
			const raw = await readFile(srcPath, "utf8");
			await writeFile(destPath, addHeader(raw, srcPath), "utf8");
			console.log(`  synced  ${destPath.replace(targetRoot + "/", "")}`);
			count++;
		}
	}
	return count;
}

let total = 0;

// 1. Composite actions → .github/.github/actions/
console.log("\n── actions ──────────────────────────────────────────");
const actionsOut = join(targetRoot, ".github", "actions");
total += await syncDir(join(TEMPLATES_ROOT, "actions"), actionsOut);

// 2. Reusable workflows → .github/.github/workflows/
console.log("\n── reusable workflows ───────────────────────────────");
const workflowsOut = join(targetRoot, ".github", "workflows");
total += await syncDir(join(TEMPLATES_ROOT, "workflows"), workflowsOut);

// 3. Thin callers → .github/workflow-templates/
console.log("\n── workflow-templates (thin callers) ────────────────");
const templatesOut = join(targetRoot, "workflow-templates");
await mkdir(templatesOut, { recursive: true });
for (const [name, content] of Object.entries(WORKFLOW_TEMPLATES)) {
	const filepath = join(templatesOut, `${name}.yml`);
	await writeFile(filepath, addThinCallerHeader(content), "utf8");
	console.log(`  written ${name}.yml`);
	total++;
}

console.log(`\n${total} file(s) synced to ${targetRoot}`);
