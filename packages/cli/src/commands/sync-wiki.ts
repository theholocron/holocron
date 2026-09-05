import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { LoadedConfig } from "../config/load-config.js";
import type { RuntimeContext } from "../plugin/loader.js";
import type { SetupStepResult } from "./setup/index.js";

export interface WikiHeaderConfig {
	owner: string;
	repoName: string;
}

export interface RunSyncWikiInput {
	loaded: LoadedConfig;
	context: RuntimeContext;
}

/**
 * Idempotently ensures `edit-this-page:` (inside the instances block) and
 * `navbar-links:` (top-level, before colors:) are present in fern/docs.yml.
 *
 * Returns true when the file was modified, false when it was already complete.
 * Throws when fern/docs.yml does not exist.
 */
export async function mergeWikiConfig(docsYmlPath: string, config: WikiHeaderConfig): Promise<boolean> {
	let content: string;
	try {
		content = await readFile(docsYmlPath, "utf8");
	} catch {
		throw new Error(`fern/docs.yml not found at ${docsYmlPath}`);
	}

	let updated = content;

	// 1. Ensure edit-this-page: is nested inside the instances block entry.
	//    Prefer inserting after "multi-source: true", then "custom-domain:", then "url:".
	if (!updated.includes("edit-this-page:")) {
		const editBlock = [
			`    edit-this-page:`,
			`      github:`,
			`        owner: ${config.owner}`,
			`        repo: ${config.repoName}`,
			`        branch: main`,
		].join("\n");

		if (/^    multi-source: true$/m.test(updated)) {
			updated = updated.replace(/^(    multi-source: true)$/m, `$1\n${editBlock}`);
		} else if (/^    custom-domain: .+$/m.test(updated)) {
			updated = updated.replace(/^(    custom-domain: .+)$/m, `$1\n${editBlock}`);
		} else {
			// Fallback: insert after the "  - url:" list item line
			updated = updated.replace(/^(  - url: .+)$/m, `$1\n${editBlock}`);
		}
	}

	// 2. Ensure navbar-links: is present at the top level, before colors:.
	if (!updated.includes("navbar-links:")) {
		const navbarBlock = [
			`navbar-links:`,
			`  - type: github`,
			`    value: https://github.com/${config.owner}/${config.repoName}`,
			``,
		].join("\n");

		if (/^colors:/m.test(updated)) {
			updated = updated.replace(/^(colors:)/m, `${navbarBlock}$1`);
		} else {
			updated = updated.trimEnd() + "\n\n" + navbarBlock.trimEnd() + "\n";
		}
	}

	if (updated !== content) {
		await writeFile(docsYmlPath, updated, "utf8");
		return true;
	}
	return false;
}

/**
 * Validates that fern/docs.yml contains the required wiki header fields.
 * Returns a list of missing field names; empty array means valid.
 */
export async function validateWikiConfig(docsYmlPath: string): Promise<string[]> {
	let content: string;
	try {
		content = await readFile(docsYmlPath, "utf8");
	} catch {
		return ["fern/docs.yml not found"];
	}

	const missing: string[] = [];
	if (!content.includes("edit-this-page:")) missing.push("edit-this-page");
	if (!content.includes("navbar-links:")) missing.push("navbar-links");
	return missing;
}

export async function runSyncWiki(input: RunSyncWikiInput): Promise<SetupStepResult> {
	const config = input.loaded.resolved;
	const dryRun = input.context.dryRun ?? false;

	if (!config.providers.wiki) {
		return { capability: "local", step: "sync wiki", status: "skip", message: "no wiki provider configured" };
	}

	const rawRepo = input.context.repo ?? config.repo?.name;
	if (!rawRepo) {
		return { capability: "local", step: "sync wiki", status: "skip", message: "no repo configured" };
	}

	const [owner, repoName] = rawRepo.split("/") as [string, string | undefined];
	if (!owner || !repoName) {
		return {
			capability: "local",
			step: "sync wiki",
			status: "skip",
			message: "repo must be owner/name format",
		};
	}

	if (dryRun) {
		return { capability: "local", step: "sync wiki", status: "dry-run" };
	}

	const docsYmlPath = join(input.context.repoRoot, "fern", "docs.yml");

	try {
		const changed = await mergeWikiConfig(docsYmlPath, { owner, repoName });
		return {
			capability: "local",
			step: "sync wiki",
			status: "ok",
			message: changed ? "added missing wiki header fields" : "already up to date",
		};
	} catch (err) {
		return {
			capability: "local",
			step: "sync wiki",
			status: "fail",
			message: err instanceof Error ? err.message : String(err),
		};
	}
}
