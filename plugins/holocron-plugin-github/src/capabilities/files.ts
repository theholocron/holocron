import { ProviderApiError, type SourceFile } from "@theholocron/cli";
import type { GitHubClient } from "@theholocron/github-client";

/** Reads one file; `null` when it does not exist. `version` is the blob sha `writeFile` needs to replace exactly this one. */
export async function readRepoFile(client: GitHubClient, repo: string, path: string): Promise<SourceFile | null> {
	try {
		const file = await client.git.getContents(repo, path);
		if (file.encoding !== "base64") throw new Error(`${repo}/${path}: unexpected encoding \`${file.encoding}\``);
		return { content: Buffer.from(file.content, "base64").toString("utf-8"), version: file.sha };
	} catch (err) {
		if (!(err instanceof ProviderApiError && err.status === 404)) throw err;
	}
	// GitHub answers 404 both for a file that is not there and for a private repo the token cannot see. Only the
	// first is "no file yet"; the second must not look like an empty one, or a sync would quietly do nothing.
	try {
		await client.repos.getRepo(repo);
	} catch (err) {
		if (err instanceof ProviderApiError && err.status === 404) {
			throw new Error(`${repo} was not found: it does not exist, or the token cannot see it`, { cause: err });
		}
		throw err;
	}
	return null;
}

/** Creates or replaces one file in a commit; GitHub refuses (409) a `version` that has since changed. */
export async function writeRepoFile(
	client: GitHubClient,
	repo: string,
	path: string,
	content: string,
	opts: { message: string; version?: string }
): Promise<void> {
	await client.git.putContents(repo, path, {
		message: opts.message,
		content,
		...(opts.version ? { sha: opts.version } : {}),
	});
}
