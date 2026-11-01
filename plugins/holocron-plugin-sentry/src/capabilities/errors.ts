import type { EnsureRelayInput, EnsureRelayResult, Errors, InspectRelayInput, RelayState } from "@theholocron/cli";
import { ProviderApiError } from "@theholocron/cli";

import type { SentryClient } from "../rest.js";
import { ensureSentryRelay, inspectSentryRelay } from "./relay.js";

/** Options for the Sentry `errors` capability. */
export interface SentryErrorsOptions {
	/** Sentry organization slug. Required for `whoami` and `ensureProject`. */
	org?: string;
	/** Default team slug for project creation. Defaults to org slug. */
	team?: string;
}

/** The `errors` capability for Sentry: finds or creates a project and reports its DSN, and manages the Comlink relay. */
export class SentryErrors implements Errors {
	/** The capability key, always `errors`. */
	readonly key = "errors" as const;
	/** The provider name, `sentry`. */
	readonly providerName = "sentry";

	constructor(
		private readonly client: () => SentryClient,
		private readonly opts: SentryErrorsOptions,
		/** The client for the relay, made with the Comlink token (see `resolveRelayToken`). */
		private readonly relayClient: () => SentryClient = client
	) {}

	async ensureRelay(input: EnsureRelayInput): Promise<EnsureRelayResult> {
		return ensureSentryRelay(this.relayClient(), this.requireOrg(), input);
	}

	async inspectRelay(input: InspectRelayInput): Promise<RelayState> {
		return inspectSentryRelay(this.relayClient(), this.requireOrg(), input);
	}

	async describe() {
		return {
			provider: "sentry",
			envKeys: ["SENTRY_DSN", "NEXT_PUBLIC_SENTRY_DSN"],
		};
	}

	async whoami() {
		// Unlike ensureProject, a missing `org` here isn't a failure — error
		// ingestion works from the DSN alone, `org` is only needed for this
		// management-API call. Let the caller fall back to describe() instead.
		if (!this.opts.org) return null;
		const org = await this.client().auth.getOrg(this.opts.org);
		return { org: org.slug };
	}

	/** Returns the public DSN of the project named `input.name` (matched by its slug), creating it when missing; needs `org`, and the new project uses `team` (default the org slug) and `platform` (default `node`). */
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
