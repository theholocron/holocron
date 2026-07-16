import { parseRepo } from "../repo.js";
import type { RestClient } from "@theholocron/cli";

/**
 * Replace a repo's topic set with the supplied list.
 *
 * Calls `PUT /repos/{owner}/{name}/topics` — GitHub replaces the full
 * set atomically, so the config is always the source of truth.
 */
export async function syncTopics(rest: RestClient, repo: string, topics: string[]): Promise<string> {
	const { owner, name } = parseRepo(repo);

	await rest.request<void>(`/repos/${owner}/${name}/topics`, {
		method: "PUT",
		body: { names: topics },
	});

	return `${topics.length} topics set`;
}
