import { spawnSync } from "node:child_process";

import { ProviderApiError } from "@theholocron/cli";
import type { TeamEntry, TeamPermission } from "@theholocron/cli";
import type { GitHubClient } from "@theholocron/github-client";

export type { TeamEntry, TeamPermission };

export interface NormalizedTeamEntry {
	slug: string;
	permission: TeamPermission;
}

export function normalizeTeamEntry(entry: TeamEntry): NormalizedTeamEntry {
	if (typeof entry === "string") return { slug: entry, permission: "push" };
	return entry;
}

function addRepoViaGhCli(org: string, slug: string, owner: string, repo: string, permission: TeamPermission): void {
	const result = spawnSync(
		"gh",
		["api", "-X", "PUT", `/orgs/${org}/teams/${slug}/repos/${owner}/${repo}`, "-f", `permission=${permission}`],
		{ encoding: "utf8" }
	);
	if (result.status !== 0) {
		throw new Error(result.stderr || `gh api exited with status ${String(result.status)}`);
	}
}

async function addRepoWithFallback(
	client: GitHubClient,
	org: string,
	slug: string,
	owner: string,
	repo: string,
	permission: TeamPermission
): Promise<void> {
	try {
		await client.teams.addRepo(org, slug, owner, repo, permission);
	} catch (err) {
		if (err instanceof ProviderApiError && err.status === 403) {
			addRepoViaGhCli(org, slug, owner, repo, permission);
			return;
		}
		throw err;
	}
}

export async function syncTeams(client: GitHubClient, repo: string, teams: TeamEntry[]): Promise<string> {
	const [org = "", name = ""] = repo.split("/", 2);
	const normalized = teams.map(normalizeTeamEntry);
	const results = await Promise.allSettled(
		normalized.map(({ slug, permission }) => addRepoWithFallback(client, org, slug, org, name, permission))
	);
	const succeeded = results.filter((r) => r.status === "fulfilled").length;
	const failedSlugs = normalized.filter((_, i) => results[i]?.status === "rejected").map(({ slug }) => slug);
	if (failedSlugs.length > 0) {
		if (succeeded === 0) throw new Error(`all teams failed: ${failedSlugs.join(", ")}`);
		return `${succeeded} synced, failed: ${failedSlugs.join(", ")}`;
	}
	return `${succeeded} team${succeeded === 1 ? "" : "s"} synced`;
}
