import type { Environment, Environments } from "@theholocron/cli";
import type { GitHubClient, GitHubEnvironment } from "@theholocron/github-client";

export interface EnvironmentsOptions {
	repo: string;
}

/** The GitHub implementation of the `environments` capability, managing a repo's deployment environments. */
export class GitHubEnvironments implements Environments {
	/** Capability key, always `"environments"`. */
	readonly key = "environments" as const;
	/** Provider name, always `"github"`. */
	readonly providerName = "github";

	constructor(
		private readonly client: GitHubClient,
		private readonly opts: EnvironmentsOptions
	) {}

	/** Lists the repo's environments with their wait timer, self-review rule and required reviewers. */
	async listEnvironments(): Promise<Environment[]> {
		const raw = await this.client.environments.listEnvironments(this.opts.repo);
		return raw.map((e) => ({
			name: e.name,
			waitTimer: e.wait_timer,
			preventSelfReview: e.prevent_self_review,
			reviewers: this.flattenReviewers(e.protection_rules),
		}));
	}

	/** Creates or updates an environment, sending only the settings the given environment defines. */
	async upsertEnvironment(env: Environment): Promise<void> {
		const body: Record<string, unknown> = {};
		if (env.waitTimer !== undefined) body.wait_timer = env.waitTimer;
		if (env.preventSelfReview !== undefined) body.prevent_self_review = env.preventSelfReview;
		if (env.reviewers !== undefined) {
			body.reviewers = env.reviewers.map((r) => ({ type: r.type, id: r.id }));
		}
		await this.client.environments.upsertEnvironment(this.opts.repo, env.name, body);
	}

	/** Deletes the named environment. */
	async deleteEnvironment(name: string): Promise<void> {
		await this.client.environments.deleteEnvironment(this.opts.repo, name);
	}

	private flattenReviewers(rules: GitHubEnvironment["protection_rules"]): Environment["reviewers"] {
		if (!rules) return undefined;
		const reviewersRule = rules.find((r) => r.type === "required_reviewers");
		if (!reviewersRule?.reviewers) return undefined;
		return reviewersRule.reviewers.map((r) => ({ type: r.type, id: r.reviewer.id }));
	}
}
