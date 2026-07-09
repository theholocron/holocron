#!/usr/bin/env tsx
/**
 * Syncs all generated content from holocron into a local checkout of
 * theholocron/.github. Prefer `holocron sync-github` for the GitHub API
 * path (no local checkout needed). Use this script when you need to
 * inspect or commit the output locally before pushing.
 *
 * Usage:
 *   tsx scripts/sync-github.mts <target-root>
 *
 * Example:
 *   git clone https://github.com/theholocron/.github.git ./dotgithub
 *   tsx scripts/sync-github.mts ./dotgithub
 */

import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { ACTIONS, REUSABLE_WORKFLOWS } from "../packages/cli/src/templates/index.js";
import { WORKFLOW_TEMPLATES } from "../packages/cli/src/commands/setup-workflows.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const SYNC_TIMESTAMP = new Date().toISOString();

const targetRoot = process.argv[2]
	? resolve(process.argv[2])
	: resolve(__dirname, "../dotgithub");

function reusableHeader(source: string): string {
	return [
		`# AUTO-GENERATED — do not edit in theholocron/.github directly.`,
		`# Source:  theholocron/holocron · ${source}`,
		`# Synced:  ${SYNC_TIMESTAMP}`,
		`# Tool:    scripts/sync-github.mts`,
		`# Changes: edit source in theholocron/holocron and push to alpha or main.`,
		``,
	].join("\n");
}

function thinCallerHeader(): string {
	return [
		`# AUTO-GENERATED — do not edit in theholocron/.github directly.`,
		`# Source:  theholocron/holocron · packages/cli/src/commands/setup-workflows.ts`,
		`# Synced:  ${SYNC_TIMESTAMP}`,
		`# Tool:    scripts/sync-github.mts`,
		`# Changes: edit setup-workflows.ts in theholocron/holocron and push.`,
		``,
	].join("\n");
}

async function write(dest: string, content: string): Promise<void> {
	await mkdir(dirname(dest), { recursive: true });
	await writeFile(dest, content, "utf8");
	console.log(`  synced  ${dest.replace(targetRoot + "/", "")}`);
}

let total = 0;

// 1. Composite actions → .github/actions/<name>/action.yml
console.log("\n── actions ──────────────────────────────────────────");
for (const [name, content] of Object.entries(ACTIONS)) {
	await write(
		join(targetRoot, ".github", "actions", `${name}.yml`),
		reusableHeader("packages/cli/src/templates/index.ts") + content
	);
	total++;
}

// 2. Reusable workflows → .github/workflows/<name>.yml
console.log("\n── reusable workflows ───────────────────────────────");
for (const [name, content] of Object.entries(REUSABLE_WORKFLOWS)) {
	await write(
		join(targetRoot, ".github", "workflows", `${name}.yml`),
		reusableHeader("packages/cli/src/templates/index.ts") + content
	);
	total++;
}

// 3. Thin callers → workflow-templates/<name>.yml
console.log("\n── workflow-templates (thin callers) ────────────────");
for (const [name, content] of Object.entries(WORKFLOW_TEMPLATES)) {
	await write(
		join(targetRoot, "workflow-templates", `${name}.yml`),
		thinCallerHeader() + content
	);
	total++;
}

console.log(`\n${total} file(s) synced to ${targetRoot}`);
