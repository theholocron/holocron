import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import type {
	LabelDef,
	PagesConfig,
	PullRequest,
	RepoRef,
	RepoSettings,
	Ruleset,
	Source,
	SourceFile,
	SourceTeamMember,
	TeamEntry,
} from "@theholocron/cli";
import { findRootSync } from "@theholocron/fs-utils";
import {
	createGitHubClient,
	type CreatePagesPayload,
	type GitHubClient,
	type UpdatePagesPayload,
} from "@theholocron/github-client";

import { readRepoFile, writeRepoFile } from "./files.js";
import { syncLabels } from "./labels.js";
import { syncProperties } from "./properties.js";
import { syncTeams } from "./teams.js";
import { syncTopics } from "./topics.js";

export interface SourceOptions {
	repo: string;
	repoRoot: string;
	/** Secondary client authenticated with HOLOCRON_ORG_TOKEN for org-scoped operations (teams, custom properties). */
	orgClient?: GitHubClient;
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
	private readonly orgClient?: GitHubClient;
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
		// `opts.repoRoot` is whatever --cwd the command was invoked with --
		// a monorepo subpackage directory (e.g. apps/sentinel) for the
		// --cwd-scoped `holocron repo setup --cwd apps/sentinel` flow, not
		// necessarily the repo root .github/ actually lives at (holocron#1072
		// review). Resolved up to the real git root here, once, so every
		// workflow/repo-file read or write below targets the one real
		// .github/ regardless of which package's config triggered the run --
		// `fallback: "start"` only matters for a repoRoot with no .git
		// anywhere above it (e.g. a test fixture), where it's already root.
		this.repoRoot = findRootSync(opts.repoRoot, ".git", { fallback: "start", realpath: true }) as string;
		this.workflowDir = join(this.repoRoot, ".github", "workflows");
		this.orgClient = opts.orgClient;
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

	async syncProperties(values: Record<string, string | string[]>): Promise<string> {
		return syncProperties(this.client, this.repo, values);
	}

	async syncTeams(teams: TeamEntry[]): Promise<string> {
		return syncTeams(this.orgClient ?? this.client, this.repo, teams);
	}

	async teamMembers(teamSlug: string): Promise<SourceTeamMember[]> {
		const members = await (this.orgClient ?? this.client).teams.members(this.owner, teamSlug);
		return members.map((m) => ({ id: String(m.id), login: m.login }));
	}

	// Files outside this repo (the links file lives in `.github-private`) need the org token, like teams.
	async readFile(path: string, repo: string = this.repo): Promise<SourceFile | null> {
		return readRepoFile(this.orgClient ?? this.client, repo, path);
	}

	async writeFile(
		path: string,
		content: string,
		opts: { message: string; version?: string; repo?: string }
	): Promise<void> {
		return writeRepoFile(this.orgClient ?? this.client, opts.repo ?? this.repo, path, content, opts);
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

	async getPullRequest(number: number, repo?: string): Promise<PullRequest> {
		const raw = await this.client.pulls.getPullRequest(repo ?? this.repo, number);
		return {
			number: raw.number,
			title: raw.title,
			state: raw.state,
			merged: raw.merged_at !== null,
			branch: raw.head.ref,
			url: raw.html_url,
		};
	}

	async configurePages(config: PagesConfig, token: string): Promise<void> {
		const pagesClient = createGitHubClient({
			token,
			baseUrl: this.baseUrl,
			fetch: this.fetchImpl,
		});

		const buildType = config.build === "workflow" ? "workflow" : "legacy";
		const branchSource = config.build === "branch" ? { branch: "gh-pages", path: "/" } : undefined;

		// Enable Pages if not already on.
		const existing = await pagesClient.pages.getPages(this.repo);
		if (!existing) {
			const createPayload: CreatePagesPayload = { build_type: buildType };
			if (branchSource) createPayload.source = branchSource;
			await pagesClient.pages.createPages(this.repo, createPayload);
		}

		// PUT the full desired state so re-runs are idempotent.
		const updatePayload: UpdatePagesPayload = { build_type: buildType };
		if (branchSource) updatePayload.source = branchSource;
		if (config.domain !== undefined) updatePayload.cname = config.domain;
		if (config.https !== undefined) updatePayload.https_enforced = config.https;
		await pagesClient.pages.updatePages(this.repo, updatePayload);
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
