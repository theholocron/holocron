import type { Analytics } from "@theholocron/cli";
import type { PostHogClient } from "@theholocron/posthog-client";

/** Options for the PostHog `analytics` capability. */
export interface PostHogAnalyticsOptions {
	/** PostHog instance host — pushed as NEXT_PUBLIC_POSTHOG_HOST. Default: https://app.posthog.com */
	host?: string;
}

/** The `analytics` capability for PostHog: finds or creates a project and reports its API token. */
export class PostHogAnalytics implements Analytics {
	/** The capability key, always `analytics`. */
	readonly key = "analytics" as const;
	/** The provider name, `posthog`. */
	readonly providerName = "posthog";

	constructor(
		private readonly client: () => PostHogClient,
		private readonly opts: PostHogAnalyticsOptions
	) {}

	async describe() {
		return {
			provider: "posthog",
			envKeys: ["NEXT_PUBLIC_POSTHOG_KEY", "NEXT_PUBLIC_POSTHOG_HOST"],
		};
	}

	/** Returns the organization slug of the user the token belongs to. */
	async whoami() {
		const user = await this.client().users.me();
		return { org: user.organization.slug };
	}

	/** Returns the API token of the project called `name`, creating the project when it does not exist yet; `alreadyExists` says which happened. */
	async ensureProject(name: string): Promise<{ token: string; alreadyExists: boolean }> {
		const { results } = await this.client().projects.list();
		const found = results.find((p) => p.name === name);
		if (found) return { token: found.api_token, alreadyExists: true };
		const project = await this.client().projects.create({ name });
		return { token: project.api_token, alreadyExists: false };
	}

	/** The host value to push as NEXT_PUBLIC_POSTHOG_HOST. */
	get resolvedHost(): string {
		return this.opts.host ?? "https://app.posthog.com";
	}
}
