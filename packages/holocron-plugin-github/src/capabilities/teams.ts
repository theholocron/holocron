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

async function addRepoViaClassicToken(
	org: string,
	slug: string,
	owner: string,
	repo: string,
	permission: TeamPermission,
	classicToken: string
): Promise<void> {
	const res = await fetch(`https://api.github.com/orgs/${org}/teams/${slug}/repos/${owner}/${repo}`, {
		method: "PUT",
		headers: {
			Authorization: `Bearer ${classicToken}`,
			Accept: "application/vnd.github+json",
			"X-GitHub-Api-Version": "2022-11-28",
			"Content-Type": "application/json",
		},
		body: JSON.stringify({ permission }),
	});
	if (!res.ok) {
		const body = await res.text().catch(() => "");
		throw new Error(`GitHub ${res.status}: ${body}`);
	}
}

async function addRepoWithFallback(
	client: GitHubClient,
	org: string,
	slug: string,
	owner: string,
	repo: string,
	permission: TeamPermission,
	classicToken?: string
): Promise<void> {
	try {
		await client.teams.addRepo(org, slug, owner, repo, permission);
	} catch (err) {
		if (err instanceof ProviderApiError && err.status === 403 && classicToken) {
			await addRepoViaClassicToken(org, slug, owner, repo, permission, classicToken);
			return;
		}
		throw err;
	}
}

export async function syncTeams(
	client: GitHubClient,
	repo: string,
	teams: TeamEntry[],
	classicToken?: string
): Promise<string> {
	const [org = "", name = ""] = repo.split("/", 2);
	const normalized = teams.map(normalizeTeamEntry);
	const results = await Promise.allSettled(
		normalized.map(({ slug, permission }) => addRepoWithFallback(client, org, slug, org, name, permission, classicToken))
	);
	const succeeded = results.filter((r) => r.status === "fulfilled").length;
	const failedSlugs = normalized.filter((_, i) => results[i]?.status === "rejected").map(({ slug }) => slug);
	if (failedSlugs.length > 0) {
		if (succeeded === 0) throw new Error(`all teams failed: ${failedSlugs.join(", ")}`);
		return `${succeeded} synced, failed: ${failedSlugs.join(", ")}`;
	}
	return `${succeeded} team${succeeded === 1 ? "" : "s"} synced`;
}
