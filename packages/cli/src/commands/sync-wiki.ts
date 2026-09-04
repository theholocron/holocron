import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { createRestClient } from "@theholocron/http-client";

import type { LoadedConfig } from "../config/load-config.js";
import type { RuntimeContext } from "../plugin/loader.js";
import type { SetupStepResult } from "./setup/index.js";

export interface WikiProduct {
	displayName: string;
	basepath: string;
	subtitle?: string;
	icon?: string;
}

export interface RunSyncWikiInput {
	loaded: LoadedConfig;
	context: RuntimeContext;
	token?: string;
	fetch?: typeof globalThis.fetch;
}

function resolveToken(input: RunSyncWikiInput): string | undefined {
	return (
		input.token ??
		input.context.cliToken ??
		process.env.HOLOCRON_READ_TOKEN ??
		process.env.GH_TOKEN ??
		process.env.GITHUB_TOKEN
	);
}

function deriveBasepath(domain: string | undefined, repoName: string): string {
	if (domain) {
		const slashIdx = domain.indexOf("/");
		if (slashIdx !== -1) return domain.slice(slashIdx + 1);
	}
	return repoName;
}

function titleCase(s: string): string {
	return s.charAt(0).toUpperCase() + s.slice(1);
}

function extractFromJson(raw: string, repoName: string): WikiProduct | null {
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
	let subtitle: string | undefined;
	let icon: string | undefined;

	if (Array.isArray(wikiEntry) && wikiEntry.length === 2) {
		const opts = wikiEntry[1] as Record<string, unknown>;
		domain = typeof opts.domain === "string" ? opts.domain : undefined;
		subtitle = typeof opts.subtitle === "string" ? opts.subtitle : undefined;
		icon = typeof opts.icon === "string" ? opts.icon : undefined;
	}

	if (!subtitle && typeof config.description === "string") {
		subtitle = config.description;
	}

	const basepath = deriveBasepath(domain, repoName);
	return {
		displayName: titleCase(basepath),
		basepath,
		...(subtitle ? { subtitle } : {}),
		...(icon ? { icon } : {}),
	};
}

function extractFromTs(raw: string, repoName: string): WikiProduct | null {
	const hasWikiProvider = /providers\s*:\s*\{[^}]*\bwiki\b/s.test(raw);
	const hasWikiPreset = /\bwikiCapability\b|\bwiki\s*\(\s*\)/.test(raw);
	if (!hasWikiProvider && !hasWikiPreset) return null;

	const domainMatch = raw.match(/\bdomain\s*:\s*["']([^"']+)["']/);
	const domain = domainMatch?.[1];

	const subtitleMatch = raw.match(/\bsubtitle\s*:\s*["']([^"']+)["']/);
	let subtitle = subtitleMatch?.[1];

	const iconMatch = raw.match(/\bicon\s*:\s*["']([^"']+)["']/);
	const icon = iconMatch?.[1];

	if (!subtitle) {
		const descMatch = raw.match(/\bdescription\s*:\s*["']([^"']+)["']/);
		subtitle = descMatch?.[1];
	}

	const basepath = deriveBasepath(domain, repoName);
	return {
		displayName: titleCase(basepath),
		basepath,
		...(subtitle ? { subtitle } : {}),
		...(icon ? { icon } : {}),
	};
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

export async function discoverWikiProducts(
	org: string,
	token: string,
	fetchFn?: typeof globalThis.fetch
): Promise<WikiProduct[]> {
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

	const products: WikiProduct[] = [];

	for (const repo of allRepos.filter((r) => !r.archived)) {
		let product: WikiProduct | null = null;

		try {
			const contents = await rest.request<FileContents>(
				`/repos/${repo.full_name}/contents/holocron.config.json`
			);
			if (contents.encoding === "base64") {
				const raw = Buffer.from(contents.content.replace(/\s/g, ""), "base64").toString("utf8");
				product = extractFromJson(raw, repo.name);
			}
		} catch {
			// no JSON config — try TS
		}

		if (!product) {
			try {
				const contents = await rest.request<FileContents>(
					`/repos/${repo.full_name}/contents/holocron.config.ts`
				);
				if (contents.encoding === "base64") {
					const raw = Buffer.from(contents.content.replace(/\s/g, ""), "base64").toString("utf8");
					product = extractFromTs(raw, repo.name);
				}
			} catch {
				// no config found — skip
			}
		}

		if (product) products.push(product);
	}

	products.sort((a, b) => a.basepath.localeCompare(b.basepath));
	return products;
}

function buildProductsBlock(products: WikiProduct[]): string {
	const lines = ["products:"];
	for (const p of products) {
		lines.push(`  - display-name: ${p.displayName}`);
		if (p.subtitle) lines.push(`    subtitle: ${p.subtitle}`);
		if (p.icon) lines.push(`    icon: ${p.icon}`);
		lines.push(`    href: /${p.basepath}`);
	}
	return lines.join("\n");
}

export async function mergeProducts(docsYmlPath: string, products: WikiProduct[]): Promise<void> {
	let content: string;
	try {
		content = await readFile(docsYmlPath, "utf8");
	} catch {
		throw new Error(`fern/docs.yml not found at ${docsYmlPath}`);
	}

	const newBlock = buildProductsBlock(products);
	const productBlockRe = /^products:(?:\n[ \t][^\n]*)*/m;

	if (productBlockRe.test(content)) {
		const updated = content.replace(productBlockRe, newBlock);
		if (updated !== content) await writeFile(docsYmlPath, updated, "utf8");
		return;
	}

	// Insert before instances: if present
	const instancesIdx = content.indexOf("\ninstances:");
	if (instancesIdx !== -1) {
		const updated =
			content.slice(0, instancesIdx + 1) + newBlock + "\n\n" + content.slice(instancesIdx + 1);
		await writeFile(docsYmlPath, updated, "utf8");
		return;
	}

	// Fallback: append at end
	await writeFile(docsYmlPath, content.trimEnd() + "\n\n" + newBlock + "\n", "utf8");
}

export async function runSyncWiki(input: RunSyncWikiInput): Promise<SetupStepResult> {
	const config = input.loaded.resolved;
	const dryRun = input.context.dryRun ?? false;

	if (!config.providers.wiki) {
		return {
			capability: "local",
			step: "sync wiki",
			status: "skip",
			message: "no wiki provider configured",
		};
	}

	const org = config.org ?? input.context.repo?.split("/")[0];
	if (!org) {
		return {
			capability: "local",
			step: "sync wiki",
			status: "skip",
			message: "no org configured",
		};
	}

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
		const products = await discoverWikiProducts(org, token, input.fetch);
		if (products.length === 0) {
			return {
				capability: "local",
				step: "sync wiki",
				status: "skip",
				message: "no wiki-enabled repos found",
			};
		}
		await mergeProducts(docsYmlPath, products);
		return {
			capability: "local",
			step: "sync wiki",
			status: "ok",
			message: `${products.length} products`,
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
