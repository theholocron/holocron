import type { Errors } from "@theholocron/cli";
import { ProviderApiError } from "@theholocron/cli";

import type { SentryClient } from "../rest.js";

export interface SentryErrorsOptions {
	/** Sentry organization slug. Required for `whoami` and `ensureProject`. */
	org?: string;
	/** Default team slug for project creation. Defaults to org slug. */
	team?: string;
}

export class SentryErrors implements Errors {
	readonly key = "errors" as const;
	readonly providerName = "sentry";

	constructor(
		private readonly client: () => SentryClient,
		private readonly opts: SentryErrorsOptions
	) {}

	async describe() {
		return {
			provider: "sentry",
			envKeys: ["SENTRY_DSN", "NEXT_PUBLIC_SENTRY_DSN"],
		};
	}

	async whoami() {
		const org = await this.client().auth.getOrg(this.requireOrg());
		return { org: org.slug };
	}

	async ensureProject(input: { name: string; platform?: string }): Promise<{ dsn: string; alreadyExists: boolean }> {
		const org = this.requireOrg();
		const slug = toSlug(input.name);

		// Try fetching the project directly — cheaper than listing all projects.
		try {
			const existing = await this.client().projects.get(org, slug);
			const keys = await this.client().projects.keys(org, existing.slug);
			const dsn = keys[0]?.dsn.public;
			/* c8 ignore next */
			if (!dsn) throw new ProviderApiError(`Sentry project ${slug} has no keys`, 404, undefined);
			return { dsn, alreadyExists: true };
		} catch (err) {
			// 404 means the project doesn't exist yet — proceed to create.
			if (!(err instanceof ProviderApiError) || err.status !== 404) throw err;
		}

		const team = this.opts.team ?? org;
		const project = await this.client().projects.create(org, team, {
			name: input.name,
			platform: input.platform ?? "node",
		});
		const keys = await this.client().projects.keys(org, project.slug);
		const dsn = keys[0]?.dsn.public;
		/* c8 ignore next */
		if (!dsn)
			throw new ProviderApiError(`Sentry project ${project.slug} has no keys after creation`, 500, undefined);
		return { dsn, alreadyExists: false };
	}

	/**
	 * `org` is optional at construction (the `errors` capability activates from
	 * env vars alone), but the management-API calls need it. Validate here so
	 * the runtime is never blocked at plugin-load time.
	 */
	private requireOrg(): string {
		if (!this.opts.org) {
			throw new Error("@theholocron/holocron-plugin-sentry requires `org` in options for this operation");
		}
		return this.opts.org;
	}
}

function toSlug(name: string): string {
	return name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "");
}
