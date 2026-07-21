import type { GitHubClient } from "@theholocron/github-client";
import type { TeamEntry, TeamPermission } from "@theholocron/cli";

export type { TeamEntry, TeamPermission };

export interface NormalizedTeamEntry {
	slug: string;
	permission: TeamPermission;
}

// Local bridge until @theholocron/github-client publishes teams support.
type TeamCapableClient = GitHubClient & {
	teams: {
		addRepo(org: string, slug: string, owner: string, repo: string, permission: TeamPermission): Promise<void>;
	};
};

export function normalizeTeamEntry(entry: TeamEntry): NormalizedTeamEntry {
	if (typeof entry === "string") return { slug: entry, permission: "push" };
	return entry;
}

export async function syncTeams(client: GitHubClient, repo: string, teams: TeamEntry[]): Promise<string> {
	const [org = "", name = ""] = repo.split("/", 2);
	const normalized = teams.map(normalizeTeamEntry);
	const teamsClient = client as unknown as TeamCapableClient;
	await Promise.all(normalized.map(({ slug, permission }) => teamsClient.teams.addRepo(org, slug, org, name, permission)));
	return `${normalized.length} team${normalized.length === 1 ? "" : "s"} synced`;
}
