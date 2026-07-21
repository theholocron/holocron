import type { GitHubClient } from "@theholocron/github-client";
import type { TeamEntry, TeamPermission } from "@theholocron/cli";

export type { TeamEntry, TeamPermission };

export interface NormalizedTeamEntry {
	slug: string;
	permission: TeamPermission;
}

export function normalizeTeamEntry(entry: TeamEntry): NormalizedTeamEntry {
	if (typeof entry === "string") return { slug: entry, permission: "push" };
	return entry;
}

export async function syncTeams(client: GitHubClient, repo: string, teams: TeamEntry[]): Promise<string> {
	const [org = "", name = ""] = repo.split("/", 2);
	const normalized = teams.map(normalizeTeamEntry);
	await Promise.all(normalized.map(({ slug, permission }) => client.teams.addRepo(org, slug, org, name, permission)));
	return `${normalized.length} team${normalized.length === 1 ? "" : "s"} synced`;
}
