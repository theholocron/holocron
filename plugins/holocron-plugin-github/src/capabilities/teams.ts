import type { TeamEntry, TeamPermission } from "@theholocron/cli";
import type { GitHubClient } from "@theholocron/github-client";

export type { TeamEntry, TeamPermission };

/** A team entry with the permission spelled out. */
export interface NormalizedTeamEntry {
	/** The team's slug. */
	slug: string;
	/** The permission the team gets on the repo. */
	permission: TeamPermission;
}

/** Turns a team entry into slug and permission form; a bare slug gets `push`. */
export function normalizeTeamEntry(entry: TeamEntry): NormalizedTeamEntry {
	if (typeof entry === "string") return { slug: entry, permission: "push" };
	return entry;
}

/** Grants each team access to the repo and reports the outcome; throws when every team fails. */
export async function syncTeams(client: GitHubClient, repo: string, teams: TeamEntry[]): Promise<string> {
	const [org = "", name = ""] = repo.split("/", 2);
	const normalized = teams.map(normalizeTeamEntry);
	const results = await Promise.allSettled(
		normalized.map(({ slug, permission }) => client.teams.addRepo(org, slug, org, name, permission))
	);
	const succeeded = results.filter((r) => r.status === "fulfilled").length;
	const failedSlugs = normalized.filter((_, i) => results[i]?.status === "rejected").map(({ slug }) => slug);
	if (failedSlugs.length > 0) {
		if (succeeded === 0) throw new Error(`all teams failed: ${failedSlugs.join(", ")}`);
		return `${succeeded} synced, failed: ${failedSlugs.join(", ")}`;
	}
	return `${succeeded} team${succeeded === 1 ? "" : "s"} synced`;
}
