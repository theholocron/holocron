import type { PermissionRule, TokenExpectation } from "@theholocron/cli";

import type { Permission } from "./permissions.js";

type Rules = Partial<Record<Permission, PermissionRule>>;

/** The same rules in every layer that runs the workflow: a laptop (`local` inherits `dev`) and CI. */
function everywhere(rules: Rules): TokenExpectation {
	return { permissions: { local: rules, dev: rules, ci: rules } };
}

/**
 * `rules` everywhere, plus a permission only a person at a terminal needs: `local` and `dev` must have `held`, and `ci`
 * must not have `ci` (a workflow's token needs no more than it uses).
 */
function withoutInCi(rules: Rules, held: Rules, ci: Rules): TokenExpectation {
	return { permissions: { local: { ...rules, ...held }, dev: { ...rules, ...held }, ci: { ...rules, ...ci } } };
}

/**
 * What each GitHub token is meant to carry, by its `envName`, the same as the GitHub tokens table in
 * `docs/src/content/docs/tokens.mdx`. This is the plugin's `tokens` declaration, read through `tokenExpectations()`;
 * change it and that table together.
 *
 * Every token CI uses (the `sync-repo`, `sync-secrets`, `reconcile-projects` and `check-tokens` workflows read all of
 * them) is declared with the same permissions in `local`, `dev` and `ci`, so the probe checks that a `ci` token is no
 * broader than its `dev` one rather than assuming a split the workflows do not allow. The release token is held by CI
 * only, so it has no `local` or `dev` entry. A narrow token must not reach administration or secrets; the admin token
 * must not reach organization secrets (that is `HOLOCRON_SECRETS_TOKEN`'s alone).
 */
export const EXPECTED: Readonly<Record<string, TokenExpectation>> = {
	HOLOCRON_READ_TOKEN: everywhere({
		contents: "required",
		actions: "required",
		administration: "absent",
		secrets: "absent",
		environments: "absent",
	}),
	HOLOCRON_ISSUES_TOKEN: everywhere({
		issues: "required",
		administration: "absent",
		secrets: "absent",
		environments: "absent",
	}),
	HOLOCRON_SYNC_TOKEN: everywhere({
		actions: "required",
		contents: "required",
		"pull-requests": "required",
		administration: "absent",
		secrets: "absent",
	}),
	HOLOCRON_RELEASE_TOKEN: {
		permissions: {
			ci: {
				contents: "required",
				issues: "required",
				"pull-requests": "required",
				administration: "absent",
				secrets: "absent",
			},
		},
	},
	HOLOCRON_ADMIN_TOKEN: withoutInCi(
		{
			administration: "required",
			secrets: "required",
			environments: "required",
			issues: "required",
			"custom-properties": "required",
			"actions-variables": "required",
			"org-secrets": "absent",
		},
		// `setup notifications` makes the Dependabot relay webhook (#2531) from a laptop; no workflow does.
		{ webhooks: "required" },
		{ webhooks: "absent" }
	),
	HOLOCRON_SECRETS_TOKEN: everywhere({ "org-secrets": "required", administration: "absent" }),
	HOLOCRON_DEPLOY_TOKEN: everywhere({
		pages: "required",
		administration: "required",
		secrets: "absent",
		"org-secrets": "absent",
	}),
	HOLOCRON_USER_SYNC_TOKEN: everywhere({
		"user-sync-contents": "required",
		administration: "absent",
		secrets: "absent",
	}),
	HOLOCRON_ORG_TOKEN: withoutInCi(
		{
			administration: "required",
			"org-members": "required",
			"org-variables": "required",
			"org-secrets": "absent",
		},
		// Only an organization-scoped relay webhook (`options.org`) needs this; this repo's is a repository webhook.
		{ "org-webhooks": "required" },
		{ "org-webhooks": "absent" }
	),
};
