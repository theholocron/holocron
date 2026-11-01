import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import {
	type LabelDef,
	MissingTokenError,
	type PagesConfig,
	ProviderApiError,
	type PullRequest,
	type RepoRef,
	type RepoSettings,
	type Ruleset,
	type Source,
	type SourceBranch,
	type SourceFile,
	type SourceRepoInfo,
	type SourceRulesetDetail,
	type SourceSecurity,
	type SourceTeamMember,
	type TeamEntry,
	type TeamPermission,
} from "@theholocron/cli";
import { findRootSync } from "@theholocron/fs-utils";
import {
	createGitHubClient,
	type CreatePagesPayload,
	type GitHubClient,
	type GitHubPullRequest,
	type UpdatePagesPayload,
} from "@theholocron/github-client";

import { readRepoFile, writeRepoFile } from "./files.js";
import { syncLabels } from "./labels.js";
import { syncProperties } from "./properties.js";
import { readRepoInfo, readSecurity, toRulesetDetail } from "./read-repo.js";
import { syncTeams } from "./teams.js";
import { syncTopics } from "./topics.js";
import { syncOrgVariables, syncVariables } from "./variables.js";

export interface SourceOptions {
	repo: string;
	repoRoot: string;
	/** Secondary client authenticated with HOLOCRON_ORG_TOKEN for org-scoped operations (teams, custom properties). */
	orgClient?: GitHubClient;
	/** Client for the files that link GitHub accounts to other services (HOLOCRON_USER_SYNC_TOKEN); falls back to the org client. */
	userSyncClient?: GitHubClient;
	/** Forwarded to a secondary client created for Pages calls (HOLOCRON_DEPLOY_TOKEN). */
	baseUrl?: string;
	fetch?: typeof fetch;
}

function toPullRequest(raw: GitHubPullRequest): PullRequest {
	return {
		number: raw.number,
		title: raw.title,
		state: raw.state,
		merged: raw.merged_at !== null,
		branch: raw.head.ref,
		headSha: raw.head.sha,
		url: raw.html_url,
	};
}

/**
 * The GitHub implementation of the `source` capability: repo settings, rulesets, branch protection, security
 * features and local workflow files.
 */
export class GitHubSource implements Source {
	/** Capability key, always `"source"`. */
	readonly key = "source" as const;
	/** Provider name, always `"github"`. */
	readonly providerName = "github";

	private readonly owner: string;
	private readonly name: string;
	private readonly repo: string;
	private readonly repoRoot: string;
	private readonly workflowDir: string;
	private readonly orgClient?: GitHubClient;
	private readonly userSyncClient?: GitHubClient;
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
		this.userSyncClient = opts.userSyncClient;
		this.baseUrl = opts.baseUrl;
		this.fetchImpl = opts.fetch;
	}

	async whoami(): Promise<{ login: string }> {
		const data = await this.client.user.getCurrentUser();
		return { login: data.login };
	}

	/** Returns the repo's owner, name and default branch. */
	async getRepo(): Promise<RepoRef> {
		const data = await this.client.repos.getRepo(this.repo);
		return { owner: this.owner, name: this.name, defaultBranch: data.default_branch };
	}

	/** Lists the repo's rulesets. */
	async listRulesets(): Promise<Ruleset[]> {
		// GitHubRuleset.enforcement is string; Ruleset.enforcement is a narrower
		// union — safe at runtime since GitHub only returns the three known values.
		return this.client.rulesets.listRulesets(this.repo) as unknown as Promise<Ruleset[]>;
	}

	/** Creates a ruleset from the given payload. */
	async createRuleset(payload: Record<string, unknown>): Promise<Ruleset> {
		return this.client.rulesets.createRuleset(this.repo, payload) as unknown as Promise<Ruleset>;
	}

	/** Updates the ruleset with the given id from the payload. */
	async updateRuleset(id: number, payload: Record<string, unknown>): Promise<Ruleset> {
		return this.client.rulesets.updateRuleset(this.repo, id, payload) as unknown as Promise<Ruleset>;
	}

	/** Updates the repo's settings. */
	async updateRepoSettings(settings: RepoSettings): Promise<void> {
		await this.client.repos.updateRepo(this.repo, settings as Record<string, unknown>);
	}

	async protectBranch(branch: string, payload: Record<string, unknown>): Promise<void> {
		await this.client.branches.protectBranch(this.repo, branch, payload);
	}

	/** Enables Dependabot vulnerability alerts. */
	async enableVulnerabilityAlerts(): Promise<void> {
		await this.client.security.enableVulnerabilityAlerts(this.repo);
	}

	/** Enables Dependabot automated security fixes. */
	async enableAutomatedSecurityFixes(): Promise<void> {
		await this.client.security.enableAutomatedSecurityFixes(this.repo);
	}

	/** Enables secret scanning. */
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

	/** Enables private vulnerability reporting. */
	async enablePrivateVulnerabilityReporting(): Promise<void> {
		await this.client.security.enablePrivateVulnerabilityReporting(this.repo);
	}

	// ── workflow files (local fs) ───────────────────────────────────────

	/** Lists the `.yml` and `.yaml` files in `.github/workflows`, sorted by name; empty when the folder is missing. */
	async listWorkflowFiles(): Promise<string[]> {
		try {
			const entries = await readdir(this.workflowDir);
			return entries.filter((e) => e.endsWith(".yml") || e.endsWith(".yaml")).sort();
		} catch (err) {
			if (isENOENT(err)) return [];
			throw err;
		}
	}

	/** Reads a workflow file's text, or `null` when it does not exist. */
	async readWorkflowFile(name: string): Promise<string | null> {
		try {
			return await readFile(join(this.workflowDir, name), "utf8");
		} catch (err) {
			if (isENOENT(err)) return null;
			throw err;
		}
	}

	/** Writes a workflow file, creating `.github/workflows` first when needed. */
	async writeWorkflowFile(name: string, contents: string): Promise<void> {
		await ensureDir(this.workflowDir);
		await writeFile(join(this.workflowDir, name), contents, "utf8");
	}

	/** Removes a workflow file; a file that is already gone is not an error. */
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

	async teamMembers(teamSlug: string, org: string = this.owner): Promise<SourceTeamMember[]> {
		const members = await (this.orgClient ?? this.client).teams.members(org, teamSlug);
		return members.map((m) => ({ id: String(m.id), login: m.login }));
	}

	// Files outside this repo (the links file lives in `.github-private`) use the user-sync token, then the org token.
	async readFile(path: string, repo: string = this.repo): Promise<SourceFile | null> {
		return readRepoFile(this.userSyncClient ?? this.orgClient ?? this.client, repo, path);
	}

	async writeFile(
		path: string,
		content: string,
		opts: { message: string; version?: string; repo?: string }
	): Promise<void> {
		return writeRepoFile(
			this.userSyncClient ?? this.orgClient ?? this.client,
			opts.repo ?? this.repo,
			path,
			content,
			opts
		);
	}

	async syncTopics(topics: string[]): Promise<string> {
		return syncTopics(this.client, this.repo, topics);
	}

	async syncVariables(
		variables: Record<string, string>,
		opts?: { prune?: boolean; dryRun?: boolean }
	): Promise<string> {
		return syncVariables(this.client, this.repo, variables, opts);
	}

	async syncOrgVariables(
		org: string,
		variables: Record<string, { value: string; visibility: "all" | "private" }>,
		opts?: { prune?: boolean; dryRun?: boolean }
	): Promise<string> {
		if (!this.orgClient) {
			throw new Error(
				"organization variables need the org token: set HOLOCRON_ORG_TOKEN or run `holocron auth set github.org <token>`"
			);
		}
		return syncOrgVariables(this.orgClient, this.repo, org, variables, opts);
	}

	async listVariables(): Promise<Record<string, string>> {
		const found = await this.client.variables.listVariables(this.repo, { kind: "repo" });
		return Object.fromEntries(found.map((v) => [v.name, v.value]));
	}

	async listOrgVariables(
		org: string
	): Promise<Record<string, { value: string; visibility: "all" | "private" | "selected" }>> {
		if (!this.orgClient) {
			throw new MissingTokenError(
				"organization variables need the org token: set HOLOCRON_ORG_TOKEN or run `holocron auth set github.org <token>`"
			);
		}
		const found = await this.orgClient.variables.listVariables(this.repo, { kind: "organization", org });
		return Object.fromEntries(found.map((v) => [v.name, { value: v.value, visibility: v.visibility ?? "all" }]));
	}

	async getRepoInfo(): Promise<SourceRepoInfo> {
		return readRepoInfo(this.client, this.repo);
	}

	async getProperties(): Promise<Record<string, string | string[]>> {
		const found = await this.client.properties.getValues(this.repo);
		return Object.fromEntries(found.flatMap((p) => (p.value === null ? [] : [[p.property_name, p.value]])));
	}

	async listLabels(): Promise<LabelDef[]> {
		const found = await this.client.labels.listLabels(this.repo);
		return found.map((l) => ({ name: l.name, color: l.color, description: l.description ?? "" }));
	}

	async listTeamAccess(): Promise<Array<{ slug: string; permission: TeamPermission }>> {
		const found = await (this.orgClient ?? this.client).teams.listForRepo(this.repo);
		return found.map((t) => ({ slug: t.slug, permission: t.permission }));
	}

	async getRulesetDetail(id: number): Promise<SourceRulesetDetail> {
		return toRulesetDetail(await this.client.rulesets.getRuleset(this.repo, id));
	}

	async getSecurity(): Promise<SourceSecurity> {
		return readSecurity(this.client, this.repo);
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
		return toPullRequest(await this.client.pulls.getPullRequest(repo ?? this.repo, number));
	}

	async listPullRequests(state: "open" | "closed", repo?: string): Promise<PullRequest[]> {
		return (await this.client.pulls.listPullRequests(repo ?? this.repo, state)).map(toPullRequest);
	}

	async listBranches(repo?: string): Promise<SourceBranch[]> {
		return (await this.client.branches.listBranches(repo ?? this.repo)).map((b) => ({
			name: b.name,
			sha: b.commit.sha,
		}));
	}

	async deleteBranch(name: string, repo?: string): Promise<void> {
		try {
			await this.client.branches.removeBranch(repo ?? this.repo, name);
		} catch (err) {
			// A ref that is already gone is what was asked for: GitHub says 422 "Reference does not exist" (404 for a repo it cannot see is not that).
			if (err instanceof ProviderApiError && err.status === 422 && String(err.details).includes("does not exist"))
				return;
			throw err;
		}
	}

	async listPullRequestCommits(number: number, repo?: string): Promise<string[]> {
		return (await this.client.pulls.listCommits(repo ?? this.repo, number)).map((commit) => commit.sha);
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
