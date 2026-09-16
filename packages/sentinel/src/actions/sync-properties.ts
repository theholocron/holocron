/**
 * Resolves and syncs GitHub custom properties for a repo — the same 10
 * fields `holocron sync`'s `properties` step computes (6 manual, straight
 * from `holocron.config.ts`'s `repo.properties`/`repo.protection`; 4
 * derived — #677) — from data fetched over the GitHub API instead of a
 * local checkout, so it can run from a webhook delivery.
 *
 * D8 parity: the actual derivation logic —
 * `deriveProfile()`/`deriveStack()`/`deriveCapabilities()`/
 * `deriveCompliance()` — is imported from `@theholocron/cli` unchanged,
 * the same functions `holocron sync` calls locally. Only the *inputs* to
 * those functions are gathered differently here (GitHub Contents/Trees
 * API reads instead of local filesystem reads) — inherent to running
 * from a webhook with no checkout, not a parallel reimplementation of
 * what the fields mean.
 *
 * Security boundary (D4/D6): every read goes through `client.git.get*()`
 * with no `ref` parameter, so it structurally can only ever see the
 * default branch — same boundary `validateConfig()` relies on.
 *
 * Known limitation: workspace-package discovery uses one recursive
 * `git.getTree()` call. GitHub truncates a tree response over ~100,000
 * entries (`truncated: true`) — for a repo that large, some `packages/*`
 * / `apps/*` entries could be missed. No repo in this org is remotely
 * close to that size today; revisit (paginated tree walk) if one ever is.
 */

import {
	deriveCapabilities,
	deriveCompliance,
	deriveProfile,
	deriveStack,
	type PackageJsonLike,
	type ResolvedProvidersConfig,
} from "@theholocron/cli";
import type { GitHubClient } from "@theholocron/github-client";
import { ProviderApiError } from "@theholocron/http-client";

import { decodeContents } from "../utils/decode-contents.js";

export interface SyncPropertiesInput {
	client: Pick<GitHubClient, "git" | "properties">;
	/** `"owner/repo"`. */
	repo: string;
	/** The repo's default branch — from the push webhook payload (`repository.default_branch`). */
	defaultBranch: string;
	/**
	 * The already-loaded `holocron.config.*` object — pass `validateConfig()`'s
	 * `config` from its `"valid"` result to avoid re-fetching. Read loosely
	 * here (this function only needs `repo` and `providers`, not the full
	 * shape any one caller's type narrows it to).
	 */
	config: Record<string, unknown>;
}

export interface SyncPropertiesResult {
	/** Every property value actually sent — for logging/check-run reporting by the caller. */
	properties: Record<string, string | string[]>;
}

interface ConfigRepoShape {
	repo?: {
		protection?: string;
		properties?: {
			lifecycle?: string;
			open_source?: boolean;
			runtime_environment?: string;
			uses_external_packages?: boolean;
		};
	};
	providers?: Record<string, unknown>;
}

const WORKSPACE_PACKAGE_JSON = /^(?:packages|apps)\/[^/]+\/package\.json$/;

/** Fetches and JSON-parses a file from the repo's default branch. `null` on 404 — matches `holocron sync`'s own soft-fail for a missing/invalid package.json. */
async function fetchJson(
	client: Pick<GitHubClient, "git">,
	repo: string,
	path: string
): Promise<PackageJsonLike | null> {
	try {
		const contents = await client.git.getContents(repo, path);
		return JSON.parse(decodeContents(contents.content)) as PackageJsonLike;
	} catch (err) {
		if (err instanceof ProviderApiError && err.status === 404) return null;
		throw err;
	}
}

/** Whether a path exists on the default branch — 404 vs. any other response. Used for `pnpm-workspace.yaml` monorepo detection, mirroring `holocron sync`'s local `access()` check. */
async function pathExists(client: Pick<GitHubClient, "git">, repo: string, path: string): Promise<boolean> {
	try {
		await client.git.getContents(repo, path);
		return true;
	} catch (err) {
		if (err instanceof ProviderApiError && err.status === 404) return false;
		throw err;
	}
}

/** Every `packages/*` and `apps/*` workspace's `package.json`, found via one recursive tree walk rather than a local `readdir`. */
async function fetchWorkspacePackageJsons(
	client: Pick<GitHubClient, "git">,
	repo: string,
	defaultBranch: string
): Promise<PackageJsonLike[]> {
	const ref = await client.git.getRef(repo, defaultBranch);
	const commit = await client.git.getCommit(repo, ref.object.sha);
	const tree = await client.git.getTree(repo, commit.tree.sha, true);

	const paths = tree.tree
		.filter((item) => item.type === "blob" && WORKSPACE_PACKAGE_JSON.test(item.path))
		.map((item) => item.path);

	const results: PackageJsonLike[] = [];
	for (const path of paths) {
		const pkg = await fetchJson(client, repo, path);
		if (pkg) results.push(pkg);
	}
	return results;
}

export async function syncPropertiesFromConfig(input: SyncPropertiesInput): Promise<SyncPropertiesResult> {
	const { client, repo, defaultBranch } = input;
	const cfg = input.config as ConfigRepoShape;
	const properties: Record<string, string | string[]> = {};

	const protection = cfg.repo?.protection;
	if (protection && protection !== "none") {
		properties["holocron_branch_protection_level"] = protection;
	}

	const isMonorepo = await pathExists(client, repo, "pnpm-workspace.yaml");
	properties["monorepo"] = String(isMonorepo);

	const manual = cfg.repo?.properties ?? {};
	if (manual.lifecycle) properties["lifecycle"] = manual.lifecycle;
	if (manual.open_source !== undefined) properties["open_source"] = String(manual.open_source);
	if (manual.runtime_environment) properties["runtime_environment"] = manual.runtime_environment;
	if (manual.uses_external_packages !== undefined) {
		properties["uses_external_packages"] = String(manual.uses_external_packages);
	}

	const rootPackageJson = await fetchJson(client, repo, "package.json");
	const workspacePackageJsons = isMonorepo ? await fetchWorkspacePackageJsons(client, repo, defaultBranch) : [];

	properties["holocron_profile"] = deriveProfile({
		rootPackageJson,
		repoName: repo.split("/")[1] ?? repo,
		isMonorepo,
		workspacePackageJsons,
	});
	properties["holocron_stack"] = deriveStack(rootPackageJson);

	const capabilities = deriveCapabilities(cfg.providers as ResolvedProvidersConfig | undefined);
	properties["holocron_capabilities"] = capabilities;
	properties["holocron_compliance"] = deriveCompliance(capabilities);

	await client.properties.setProperties(repo, properties);
	return { properties };
}
