import type { GitHubClient } from "@theholocron/github-client";

export async function syncProperties(client: GitHubClient, repo: string, values: Record<string, string>): Promise<string> {
	await client.properties.setProperties(repo, values);
	return `${Object.keys(values).length} properties set`;
}
