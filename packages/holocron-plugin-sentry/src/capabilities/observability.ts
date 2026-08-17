import type { Observability } from "@theholocron/cli";
import { ProviderApiError } from "@theholocron/cli";

import type { SentryClient } from "../rest.js";

export interface SentryObservabilityOptions {
	/** Sentry organization slug. Required. */
	org: string;
	/** Default team slug for project creation. Defaults to org slug. */
	team?: string;
}

export class SentryObservability implements Observability {
	readonly key = "observability" as const;
	readonly providerName = "sentry";

	constructor(
		private readonly client: SentryClient,
		private readonly opts: SentryObservabilityOptions
	) {
		if (!opts.org) throw new Error("SentryObservability requires `org` in options");
	}

	async describe() {
		return {
			provider: "sentry",
			envKeys: ["SENTRY_DSN", "NEXT_PUBLIC_SENTRY_DSN"],
		};
	}

	async whoami() {
		const org = await this.client.auth.getOrg(this.opts.org);
		return { org: org.slug };
	}

	async ensureProject(input: { name: string; platform?: string }): Promise<{ dsn: string; alreadyExists: boolean }> {
		const slug = toSlug(input.name);

		// Try fetching the project directly — cheaper than listing all projects.
		try {
			const existing = await this.client.projects.get(this.opts.org, slug);
			const keys = await this.client.projects.keys(this.opts.org, existing.slug);
			const dsn = keys[0]?.dsn.public;
			/* c8 ignore next */
			if (!dsn) throw new ProviderApiError(`Sentry project ${slug} has no keys`, 404, undefined);
			return { dsn, alreadyExists: true };
		} catch (err) {
			// 404 means the project doesn't exist yet — proceed to create.
			if (!(err instanceof ProviderApiError) || err.status !== 404) throw err;
		}

		const team = this.opts.team ?? this.opts.org;
		const project = await this.client.projects.create(this.opts.org, team, {
			name: input.name,
			platform: input.platform ?? "node",
		});
		const keys = await this.client.projects.keys(this.opts.org, project.slug);
		const dsn = keys[0]?.dsn.public;
		/* c8 ignore next */
		if (!dsn)
			throw new ProviderApiError(`Sentry project ${project.slug} has no keys after creation`, 500, undefined);
		return { dsn, alreadyExists: false };
	}
}

function toSlug(name: string): string {
	return name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "");
}
