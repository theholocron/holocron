import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import type { LabelDef, PagesConfig, RepoRef, RepoSettings, Ruleset, Source, TeamEntry } from "@theholocron/cli";
import { createGitHubClient, type GitHubClient } from "@theholocron/github-client";

// Temporary — remove once @theholocron/github-client (feat/github-pages-api) is released
// and the catalog version in pnpm-workspace.yaml is bumped to pick up the pages module.
interface PagesApi {
	getPages(repo: string): Promise<{ build_type: string | null } | null>;
	createPages(repo: string, payload: Record<string, unknown>): Promise<unknown>;
	updatePages(repo: string, payload: Record<string, unknown>): Promise<void>;
}

import { syncLabels } from "./labels.js";
import { syncProperties } from "./properties.js";
import { syncTeams } from "./teams.js";
import { syncTopics } from "./topics.js";

export interface SourceOptions {
	repo: string;
	repoRoot: string;
	/** Forwarded to a secondary client created for Pages calls (HOLOCRON_DEPLOY_TOKEN). */
	baseUrl?: string;
	fetch?: typeof fetch;
}

export class GitHubSource implements Source {
	readonly key = "source" as const;
	readonly providerName = "github";

	private readonly owner: string;
	private readonly name: string;
	private readonly repo: string;
	private readonly repoRoot: string;
	private readonly workflowDir: string;
	private readonly baseUrl?: string;
	private readonly fetchImpl?: typeof fetch;

	constructor(
		private readonly client: GitHubClient,
		opts: SourceOptions
	) {
		const [owner = "", name = ""] = opts.repo.split("/", 2);
		this.owner = owner;
		this.name = name;
		this.repo = opts.repo;
		this.repoRoot = opts.repoRoot;
		this.workflowDir = join(opts.repoRoot, ".github", "workflows");
		this.baseUrl = opts.baseUrl;
		this.fetchImpl = opts.fetch;
	}

	async whoami(): Promise<{ login: string }> {
		const data = await this.client.user.getCurrentUser();
		return { login: data.login };
	}

	async getRepo(): Promise<RepoRef> {
		const data = await this.client.repos.getRepo(this.repo);
		return { owner: this.owner, name: this.name, defaultBranch: data.default_branch };
	}

	async listRulesets(): Promise<Ruleset[]> {
		// GitHubRuleset.enforcement is string; Ruleset.enforcement is a narrower
		// union — safe at runtime since GitHub only returns the three known values.
		return this.client.rulesets.listRulesets(this.repo) as unknown as Promise<Ruleset[]>;
	}

	async createRuleset(payload: Record<string, unknown>): Promise<Ruleset> {
		return this.client.rulesets.createRuleset(this.repo, payload) as unknown as Promise<Ruleset>;
	}

	async updateRuleset(id: number, payload: Record<string, unknown>): Promise<Ruleset> {
		return this.client.rulesets.updateRuleset(this.repo, id, payload) as unknown as Promise<Ruleset>;
	}

	async updateRepoSettings(settings: RepoSettings): Promise<void> {
		await this.client.repos.updateRepo(this.repo, settings as Record<string, unknown>);
	}

	async protectBranch(branch: string, payload: Record<string, unknown>): Promise<void> {
		await this.client.branches.protectBranch(this.repo, branch, payload);
	}

	async enableVulnerabilityAlerts(): Promise<void> {
		await this.client.security.enableVulnerabilityAlerts(this.repo);
	}

	async enableAutomatedSecurityFixes(): Promise<void> {
		await this.client.security.enableAutomatedSecurityFixes(this.repo);
	}

	async enableSecretScanning(): Promise<void> {
		await this.client.security.enableSecretScanning(this.repo);
	}

	async enableCodeScanning(): Promise<string> {
		const result = await this.client.security.enableCodeScanning(this.repo);
		return `run ${result.run_id}`;
	}

	async disableDefaultCodeScanning(): Promise<void> {
		await this.client.security.disableDefaultCodeScanning(this.repo);
	}

	async enableDependencyGraph(): Promise<void> {
		await this.client.security.enableDependencyGraph(this.repo);
	}

	async enablePrivateVulnerabilityReporting(): Promise<void> {
		await this.client.security.enablePrivateVulnerabilityReporting(this.repo);
	}

	// ── workflow files (local fs) ───────────────────────────────────────

	async listWorkflowFiles(): Promise<string[]> {
		try {
			const entries = await readdir(this.workflowDir);
			return entries.filter((e) => e.endsWith(".yml") || e.endsWith(".yaml")).sort();
		} catch (err) {
			if (isENOENT(err)) return [];
			throw err;
		}
	}

	async readWorkflowFile(name: string): Promise<string | null> {
		try {
			return await readFile(join(this.workflowDir, name), "utf8");
		} catch (err) {
			if (isENOENT(err)) return null;
			throw err;
		}
	}

	async writeWorkflowFile(name: string, contents: string): Promise<void> {
		await ensureDir(this.workflowDir);
		await writeFile(join(this.workflowDir, name), contents, "utf8");
	}

	async removeWorkflowFile(name: string): Promise<void> {
		try {
			await rm(join(this.workflowDir, name));
		} catch (err) {
			if (isENOENT(err)) return;
			throw err;
		}
	}

	async writeRepoFile(path: string, contents: string): Promise<void> {
		const full = join(this.repoRoot, path);
		await ensureDir(dirname(full));
		await writeFile(full, contents, "utf8");
	}

	async syncLabels(canonical: ReadonlyArray<LabelDef>, stale: ReadonlyArray<string>): Promise<string> {
		return syncLabels(this.client, this.repo, canonical, stale);
	}

	async syncProperties(values: Record<string, string>): Promise<string> {
		return syncProperties(this.client, this.repo, values);
	}

	async syncTeams(teams: TeamEntry[]): Promise<string> {
		return syncTeams(this.client, this.repo, teams);
	}

	async syncTopics(topics: string[]): Promise<string> {
		return syncTopics(this.client, this.repo, topics);
	}

	async syncDescription(description: string): Promise<string> {
		await this.client.repos.updateRepo(this.repo, { description });
		return "description updated";
	}

	async syncHomepage(homepage: string): Promise<string> {
		await this.client.repos.updateRepo(this.repo, { homepage });
		return "homepage updated";
	}

	async configurePages(config: PagesConfig, token: string): Promise<void> {
		const rawClient = createGitHubClient({
			token,
			baseUrl: this.baseUrl,
			fetch: this.fetchImpl,
		});
		// Cast until @theholocron/github-client (feat/github-pages-api) is released.
		const pagesApi = (rawClient as unknown as { pages: PagesApi }).pages;

		const buildType = config.build === "workflow" ? "workflow" : "legacy";
		const branchSource = config.build === "branch" ? { branch: "gh-pages", path: "/" } : undefined;

		// Enable Pages if not already on.
		const existing = await pagesApi.getPages(this.repo);
		if (!existing) {
			await pagesApi.createPages(this.repo, {
				build_type: buildType,
				...(branchSource ? { source: branchSource } : {}),
			});
		}

		// PUT the full desired state so re-runs are idempotent.
		await pagesApi.updatePages(this.repo, {
			build_type: buildType,
			...(branchSource ? { source: branchSource } : {}),
			...(config.domain !== undefined ? { cname: config.domain } : {}),
			...(config.https !== undefined ? { https_enforced: config.https } : {}),
		});
	}
}

function isENOENT(err: unknown): boolean {
	return typeof err === "object" && err !== null && "code" in err && (err as { code?: string }).code === "ENOENT";
}

async function ensureDir(path: string): Promise<void> {
	try {
		const s = await stat(path);
		if (!s.isDirectory()) {
			throw new Error(`${path} exists but is not a directory`);
		}
	} catch (err) {
		if (isENOENT(err)) {
			await mkdir(path, { recursive: true });
			return;
		}
		throw err;
	}
}
