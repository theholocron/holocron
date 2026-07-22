import type { GitHubClient } from "@theholocron/github-client";

export async function syncTopics(client: GitHubClient, repo: string, topics: string[]): Promise<string> {
	await client.topics.setTopics(repo, topics);
	return `${topics.length} topics set`;
}
