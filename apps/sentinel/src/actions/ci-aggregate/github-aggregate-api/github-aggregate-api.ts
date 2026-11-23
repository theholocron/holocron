import type { AggregateApi, AggregateWrite } from "@theholocron/astromech";
import type { GitHubClient } from "@theholocron/github-client";

const outputFor = (write: AggregateWrite) => ({
	title: write.title,
	summary: write.summary,
	...(write.text === "" ? {} : { text: write.text }),
});

/**
 * `postAggregate()`'s four calls over the installation's GitHub client. Reads are the whole state each time (never the
 * webhook payload); a write puts the verdict and the failing-first table on the check run.
 */
export function githubAggregateApi(client: GitHubClient, repo: string): AggregateApi {
	return {
		listCheckRuns: async (sha) =>
			(await client.checks.listCheckRunsForRef(repo, sha)).map((run) => ({
				id: run.id,
				name: run.name,
				status: run.status,
				conclusion: run.conclusion,
				startedAt: run.started_at ?? null,
				url: run.details_url ?? run.html_url,
			})),
		listCommitStatuses: async (sha) =>
			(await client.statuses.listCommitStatuses(repo, sha)).map((status) => ({
				context: status.context,
				state: status.state,
				url: status.target_url,
			})),
		createCheckRun: async (sha, name, write) =>
			(
				await client.checks.createCheckRun(repo, {
					name,
					head_sha: sha,
					status: write.status,
					...(write.conclusion === undefined ? {} : { conclusion: write.conclusion }),
					output: outputFor(write),
					...(write.startedAt === undefined ? {} : { started_at: write.startedAt }),
				})
			).id,
		updateCheckRun: async (id, write) => {
			await client.checks.updateCheckRun(repo, id, {
				status: write.status,
				...(write.conclusion === undefined ? {} : { conclusion: write.conclusion }),
				output: outputFor(write),
			});
		},
	};
}
