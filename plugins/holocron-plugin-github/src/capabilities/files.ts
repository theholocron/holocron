import { ProviderApiError, type SourceFile } from "@theholocron/cli";
import type { GitHubClient } from "@theholocron/github-client";

/** Reads one file; `null` when it does not exist. `version` is the blob sha `writeFile` needs to replace exactly this one. */
export async function readRepoFile(client: GitHubClient, repo: string, path: string): Promise<SourceFile | null> {
	try {
		const file = await client.git.getContents(repo, path);
		if (file.encoding !== "base64") throw new Error(`${repo}/${path}: unexpected encoding \`${file.encoding}\``);
		return { content: Buffer.from(file.content, "base64").toString("utf-8"), version: file.sha };
	} catch (err) {
		if (err instanceof ProviderApiError && err.status === 404) return null;
		throw err;
	}
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
