/**
 * `source` capability for GitHub.
 *
 * Ported from rando-id/rando.id `packages/cli/src/adapters/gh-rest.ts`
 * with two changes for v2:
 *
 *  - Repo coords are bound at construction time (not passed per call)
 *  - Workflow files are local-fs operations (not GH API) — they live
 *    in the consumer's `.github/workflows/` directory
 */

import { readdir, readFile, rm, writeFile, mkdir, stat } from "node:fs/promises";
import { join, dirname } from "node:path";

import type { RepoRef, RepoSettings, Ruleset, Source } from "@theholocron/cli";

import { parseRepo } from "../repo.js";
import type { GitHubRestClient } from "../rest.js";

export interface SourceOptions {
	repo: string;
	/** Absolute path to the repo root. Workflow file ops are scoped here. */
	repoRoot: string;
}

export class GitHubSource implements Source {
	readonly key = "source" as const;
	readonly providerName = "github";

	private readonly owner: string;
	private readonly name: string;
	private readonly repoPath: string;
	private readonly repoRoot: string;
	private readonly workflowDir: string;

	constructor(
		private readonly rest: GitHubRestClient,
		opts: SourceOptions
	) {
		const { owner, name } = parseRepo(opts.repo);
		this.owner = owner;
		this.name = name;
		this.repoPath = `/repos/${owner}/${name}`;
		this.repoRoot = opts.repoRoot;
		this.workflowDir = join(opts.repoRoot, ".github", "workflows");
	}

	// ── auth + repo identity ────────────────────────────────────────────

	async whoami(): Promise<{ login: string }> {
		const data = await this.rest.request<{ login: string }>("/user");
		return { login: data.login };
	}

	async getRepo(): Promise<RepoRef> {
		const data = await this.rest.request<{ default_branch: string }>(this.repoPath);
		return { owner: this.owner, name: this.name, defaultBranch: data.default_branch };
	}

	// ── rulesets ────────────────────────────────────────────────────────

	async listRulesets(): Promise<Ruleset[]> {
		return this.rest.request<Ruleset[]>(`${this.repoPath}/rulesets`);
	}

	async createRuleset(payload: Record<string, unknown>): Promise<Ruleset> {
		return this.rest.request<Ruleset>(`${this.repoPath}/rulesets`, {
			method: "POST",
			body: payload,
		});
	}

	async updateRuleset(id: number, payload: Record<string, unknown>): Promise<Ruleset> {
		return this.rest.request<Ruleset>(`${this.repoPath}/rulesets/${id}`, {
			method: "PUT",
			body: payload,
		});
	}

	// ── repo settings ───────────────────────────────────────────────────

	async updateRepoSettings(settings: RepoSettings): Promise<void> {
		await this.rest.request<void>(this.repoPath, { method: "PATCH", body: settings });
	}

	// ── security toggles (idempotent flip-or-noop) ──────────────────────

	async enableVulnerabilityAlerts(): Promise<void> {
		await this.rest.request<void>(`${this.repoPath}/vulnerability-alerts`, {
			method: "PUT",
			expectNoContent: true,
		});
	}

	async enableAutomatedSecurityFixes(): Promise<void> {
		await this.rest.request<void>(`${this.repoPath}/automated-security-fixes`, {
			method: "PUT",
			expectNoContent: true,
		});
	}

	async enableSecretScanning(): Promise<void> {
		await this.rest.request<void>(this.repoPath, {
			method: "PATCH",
			body: {
				security_and_analysis: {
					secret_scanning: { status: "enabled" },
					secret_scanning_push_protection: { status: "enabled" },
					// Validity checks confirm found secrets are still active (reduces
					// false positives). Non-provider patterns catches secrets outside
					// known provider formats. Both require org-level GHAS — accepted
					// as a no-op until that is enabled.
					secret_scanning_validity_checks: { status: "enabled" },
					secret_scanning_non_provider_patterns: { status: "enabled" },
				},
			},
		});
	}

	async enableDependencyGraph(): Promise<void> {
		await this.rest.request<void>(this.repoPath, {
			method: "PATCH",
			body: {
				security_and_analysis: {
					// Auto-on for public repos; explicit for private repos.
					dependency_graph: { status: "enabled" },
					// Automatically submits dependency snapshots via GitHub Actions.
					dependency_graph_autosubmit_action: { status: "enabled" },
				},
			},
		});
	}

	async enablePrivateVulnerabilityReporting(): Promise<void> {
		await this.rest.request<void>(`${this.repoPath}/private-vulnerability-reporting`, {
			method: "PUT",
			expectNoContent: true,
		});
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
