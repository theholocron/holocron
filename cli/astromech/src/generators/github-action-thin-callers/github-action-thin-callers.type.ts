/** Where a repo's pull-request previews are deployed. */
export interface PreviewConfig {
	/** Cloudflare Pages project name shared across all repos for previews. */
	project: string;
	/**
	 * Base domain for preview URLs (e.g. `"preview.theholocron.dev"`).
	 * When set, `holocron repo setup` automatically provisions:
	 * - Cloudflare Pages custom domain `*.<domain>` on the project
	 * - DNS wildcard CNAME `*.<domain>` → `<project>.pages.dev`
	 *
	 * Preview URLs resolve as `<repo>-pr-<n>.<domain>`.
	 */
	domain?: string;
}

/** Org-level context used to derive preview defaults from `preview: true`. */
export interface OrgContext {
	/** GitHub org name — becomes the prefix of the default project: `<org>-preview`. */
	org?: string;
	/** Org canonical domain — becomes `preview.<domain>` for the default preview domain. */
	domain?: string;
	/** Project name — injected as the `name` input to the deploy reusable when `docs: true`. */
	repoName?: string;
}
