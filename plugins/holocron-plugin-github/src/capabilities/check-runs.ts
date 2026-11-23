import type { SourceCheckRun, SourceCheckRunWrite, SourceCommitStatus } from "@theholocron/cli";
import type { GitHubClient } from "@theholocron/github-client";

/** Every check run on a commit in the plain shape the CLI reads (the aggregate's own included). */
export async function readCheckRuns(client: GitHubClient, repo: string, ref: string): Promise<SourceCheckRun[]> {
	const runs = await client.checks.listCheckRunsForRef(repo, ref);
	return runs.map((run) => ({
		id: run.id,
		name: run.name,
		status: run.status,
		conclusion: run.conclusion,
		startedAt: run.started_at ?? null,
		url: run.details_url ?? run.html_url,
		appSlug: run.app?.slug ?? null,
	}));
}

/** The commit statuses on a commit, newest first, in the plain shape the CLI reads. */
export async function readCommitStatuses(
	client: GitHubClient,
	repo: string,
	ref: string
): Promise<SourceCommitStatus[]> {
	const statuses = await client.statuses.listCommitStatuses(repo, ref);
	return statuses.map((status) => ({ context: status.context, state: status.state, url: status.target_url }));
}

/** GitHub's `output` for a write: the title and summary, and the details only when there are some. */
function outputFor(write: SourceCheckRunWrite) {
	return { title: write.title, summary: write.summary, ...(write.text === "" ? {} : { text: write.text }) };
}

/** Posts a check run on a commit and returns its id. */
export async function postCheckRun(
	client: GitHubClient,
	repo: string,
	sha: string,
	name: string,
	write: SourceCheckRunWrite
): Promise<number> {
	const created = await client.checks.createCheckRun(repo, {
		name,
		head_sha: sha,
		status: write.status,
		...(write.conclusion === undefined ? {} : { conclusion: write.conclusion }),
		output: outputFor(write),
		...(write.startedAt === undefined ? {} : { started_at: write.startedAt }),
	});
	return created.id;
}

/** Changes a check run: its state, verdict and output. */
export async function patchCheckRun(
	client: GitHubClient,
	repo: string,
	id: number,
	write: SourceCheckRunWrite
): Promise<void> {
	await client.checks.updateCheckRun(repo, id, {
		status: write.status,
		...(write.conclusion === undefined ? {} : { conclusion: write.conclusion }),
		output: outputFor(write),
	});
}
