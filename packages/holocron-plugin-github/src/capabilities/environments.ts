import type { Environment, Environments } from "@theholocron/cli";
import type { GitHubClient, GitHubEnvironment } from "@theholocron/github-client";

export interface EnvironmentsOptions {
	repo: string;
}

export class GitHubEnvironments implements Environments {
	readonly key = "environments" as const;
	readonly providerName = "github";

	constructor(
		private readonly client: GitHubClient,
		private readonly opts: EnvironmentsOptions
	) {}

	async listEnvironments(): Promise<Environment[]> {
		const raw = await this.client.environments.listEnvironments(this.opts.repo);
		return raw.map((e) => ({
			name: e.name,
			waitTimer: e.wait_timer,
			preventSelfReview: e.prevent_self_review,
			reviewers: this.flattenReviewers(e.protection_rules),
		}));
	}

	async upsertEnvironment(env: Environment): Promise<void> {
		const body: Record<string, unknown> = {};
		if (env.waitTimer !== undefined) body.wait_timer = env.waitTimer;
		if (env.preventSelfReview !== undefined) body.prevent_self_review = env.preventSelfReview;
		if (env.reviewers !== undefined) {
			body.reviewers = env.reviewers.map((r) => ({ type: r.type, id: r.id }));
		}
		await this.client.environments.upsertEnvironment(this.opts.repo, env.name, body);
	}

	async deleteEnvironment(name: string): Promise<void> {
		await this.client.environments.deleteEnvironment(this.opts.repo, name);
	}

	private flattenReviewers(
		rules: GitHubEnvironment["protection_rules"]
	): Environment["reviewers"] {
		if (!rules) return undefined;
		const reviewersRule = rules.find((r) => r.type === "required_reviewers");
		if (!reviewersRule?.reviewers) return undefined;
		return reviewersRule.reviewers.map((r) => ({ type: r.type, id: r.reviewer.id }));
	}
}
