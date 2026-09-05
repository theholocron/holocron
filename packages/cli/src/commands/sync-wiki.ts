import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { createRestClient } from "@theholocron/http-client";

import type { LoadedConfig } from "../config/load-config.js";
import type { RuntimeContext } from "../plugin/loader.js";
import type { SetupStepResult } from "./setup/index.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WikiRepo {
	displayName: string;
	basepath: string;
	/** Full custom domain with basepath, e.g. "wiki.theholocron.dev/skills". */
	domain?: string;
}

export interface RunSyncWikiInput {
	loaded: LoadedConfig;
	context: RuntimeContext;
	token?: string;
	fetch?: typeof globalThis.fetch;
}

// ---------------------------------------------------------------------------
// Token resolution
// ---------------------------------------------------------------------------

function resolveToken(input: RunSyncWikiInput): string | undefined {
	return (
		input.token ??
		input.context.cliToken ??
		process.env.HOLOCRON_READ_TOKEN ??
		process.env.GH_TOKEN ??
		process.env.GITHUB_TOKEN
	);
}

// ---------------------------------------------------------------------------
// Config parsing helpers
// ---------------------------------------------------------------------------

function deriveBasepath(domain: string | undefined, repoName: string): string {
	if (domain) {
		const slashIdx = domain.indexOf("/");
		if (slashIdx !== -1) return domain.slice(slashIdx + 1);
	}
	return repoName;
}

function toNavLabel(basepath: string): string {
	return basepath
		.split("-")
		.map((w) => w.charAt(0).toUpperCase() + w.slice(1))
		.join(" ");
}

interface OrgRepo {
	name: string;
	full_name: string;
	archived: boolean;
}

interface FileContents {
	content: string;
	encoding: string;
}

function extractFromJson(raw: string, repoName: string): WikiRepo | null {
	let config: Record<string, unknown>;
	try {
		config = JSON.parse(raw) as Record<string, unknown>;
	} catch {
		return null;
	}
	const providers = config.providers as Record<string, unknown> | undefined;
	if (!providers?.wiki) return null;

	const wikiEntry = providers.wiki;
	let domain: string | undefined;

	if (Array.isArray(wikiEntry) && wikiEntry.length === 2) {
		const opts = wikiEntry[1] as Record<string, unknown>;
		domain = typeof opts.domain === "string" ? opts.domain : undefined;
	}

	const basepath = deriveBasepath(domain, repoName);
	return { displayName: toNavLabel(basepath), basepath, ...(domain ? { domain } : {}) };
}

function extractFromTs(raw: string, repoName: string): WikiRepo | null {
	const hasWikiProvider = /providers\s*:\s*\{[^}]*\bwiki\b/s.test(raw);
	const hasWikiPreset = /\bwikiCapability\b|\bwiki\s*\(\s*\)/.test(raw);
	if (!hasWikiProvider && !hasWikiPreset) return null;

	const domainMatch = raw.match(/\bdomain\s*:\s*["']([^"']+)["']/);
	const domain = domainMatch?.[1];

	const basepath = deriveBasepath(domain, repoName);
	return { displayName: toNavLabel(basepath), basepath, ...(domain ? { domain } : {}) };
}

// ---------------------------------------------------------------------------
// Discovery
// ---------------------------------------------------------------------------

export async function discoverWikiRepos(
	org: string,
	token: string,
	fetchFn?: typeof globalThis.fetch
): Promise<WikiRepo[]> {
	const rest = createRestClient({
		baseUrl: "https://api.github.com",
		token,
		extraHeaders: {
			accept: "application/vnd.github+json",
			"x-github-api-version": "2022-11-28",
		},
		vendor: "GitHub",
		fetch: fetchFn,
	});

	const allRepos: OrgRepo[] = [];
	let page = 1;
	while (true) {
		const batch = await rest.request<OrgRepo[]>(`/orgs/${org}/repos`, {
			query: { per_page: "100", page: String(page), type: "all" },
		});
		allRepos.push(...batch);
		if (batch.length < 100) break;
		page++;
	}

	const repos: WikiRepo[] = [];

	for (const repo of allRepos.filter((r) => !r.archived)) {
		let found: WikiRepo | null = null;

		try {
			const contents = await rest.request<FileContents>(
				`/repos/${repo.full_name}/contents/holocron.config.json`
			);
			if (contents.encoding === "base64") {
				const raw = Buffer.from(contents.content.replace(/\s/g, ""), "base64").toString("utf8");
				found = extractFromJson(raw, repo.name);
			}
		} catch {
			// no JSON config — try TS
		}

		if (!found) {
			try {
				const contents = await rest.request<FileContents>(
					`/repos/${repo.full_name}/contents/holocron.config.ts`
				);
				if (contents.encoding === "base64") {
					const raw = Buffer.from(contents.content.replace(/\s/g, ""), "base64").toString("utf8");
					found = extractFromTs(raw, repo.name);
				}
			} catch {
				// no config found — skip
			}
		}

		if (found) repos.push(found);
	}

	repos.sort((a, b) => a.basepath.localeCompare(b.basepath));
	return repos;
}

// ---------------------------------------------------------------------------
// navbar-links block builder
// ---------------------------------------------------------------------------

/**
 * Builds the complete navbar-links YAML block for a given repo.
 *
 * Includes:
 *  - A GitHub button linking to the repo itself (always first)
 *  - Minimal nav links to every other wiki-enabled repo (excluding self)
 *
 * The block is replaced wholesale on each sync so removed wikis disappear
 * and new ones appear automatically.
 */
export function buildNavbarLinks(repos: WikiRepo[], currentBasepath: string, repoFullName: string): string {
	const lines = [
		`navbar-links:`,
		`  - type: github`,
		`    value: https://github.com/${repoFullName}`,
	];

	for (const repo of repos) {
		if (repo.basepath === currentBasepath) continue; // skip self
		const url = repo.domain ? `https://${repo.domain}` : `https://wiki.theholocron.dev/${repo.basepath}`;
		lines.push(`  - type: minimal`, `    value: ${url}`, `    label: ${repo.displayName}`);
	}

	return lines.join("\n");
}

// ---------------------------------------------------------------------------
// fern/docs.yml updater
// ---------------------------------------------------------------------------

/**
 * Idempotently ensures `edit-this-page:` (inside instances) is present and
 * replaces `navbar-links:` with the provided shared block.
 *
 * Returns true when the file was modified.
 * Throws when fern/docs.yml does not exist.
 */
export async function mergeWikiConfig(
	docsYmlPath: string,
	config: { owner: string; repoName: string; navbarBlock: string }
): Promise<boolean> {
	let content: string;
	try {
		content = await readFile(docsYmlPath, "utf8");
	} catch {
		throw new Error(`fern/docs.yml not found at ${docsYmlPath}`);
	}

	let updated = content;

	// 1. Ensure edit-this-page: is nested inside the instances block entry.
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

	// 2. Replace navbar-links: wholesale so removed/added wikis stay in sync.
	const navbarRe = /^navbar-links:(?:\n[ \t][^\n]*)*/m;
	if (navbarRe.test(updated)) {
		updated = updated.replace(navbarRe, config.navbarBlock);
	} else if (/^colors:/m.test(updated)) {
		updated = updated.replace(/^(colors:)/m, `${config.navbarBlock}\n\n$1`);
	} else {
		updated = updated.trimEnd() + "\n\n" + config.navbarBlock + "\n";
	}

	if (updated !== content) {
		await writeFile(docsYmlPath, updated, "utf8");
		return true;
	}
	return false;
}

// ---------------------------------------------------------------------------
// Validate
// ---------------------------------------------------------------------------

/**
 * Checks that fern/docs.yml has the required wiki header fields.
 * Returns a list of missing field names; empty means valid.
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

// ---------------------------------------------------------------------------
// runSyncWiki
// ---------------------------------------------------------------------------

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

	const org = config.org ?? owner;

	const token = resolveToken(input);
	if (!token) {
		return {
			capability: "local",
			step: "sync wiki",
			status: "skip",
			message: "no GitHub token available (set HOLOCRON_READ_TOKEN or GH_TOKEN)",
		};
	}

	if (dryRun) {
		return { capability: "local", step: "sync wiki", status: "dry-run" };
	}

	const docsYmlPath = join(input.context.repoRoot, "fern", "docs.yml");

	try {
		const repos = await discoverWikiRepos(org, token, input.fetch);

		// Derive the current repo's basepath from its own wiki config so we
		// can exclude it from the nav links it renders for itself.
		const wikiEntry = config.providers.wiki;
		const domain = Array.isArray(wikiEntry) ? (wikiEntry[1] as Record<string, unknown>)?.domain : undefined;
		const currentBasepath = deriveBasepath(typeof domain === "string" ? domain : undefined, repoName);

		const navbarBlock = buildNavbarLinks(repos, currentBasepath, rawRepo);

		const changed = await mergeWikiConfig(docsYmlPath, { owner, repoName, navbarBlock });
		return {
			capability: "local",
			step: "sync wiki",
			status: "ok",
			message: changed ? `updated (${repos.length} wiki repos discovered)` : "already up to date",
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
