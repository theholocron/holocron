/**
 * `@theholocron/holocron-plugin-github` — entrypoint.
 *
 * Holocron loads a plugin by resolving its package and reading the
 * default export, which is a `Plugin` object declaring which
 * capabilities it implements. The factory for each capability
 * receives plugin-level options from `holocron.config.json` and
 * returns the bound implementation.
 */

import type { Auth, Ci, Environments, Issues, Secrets, Source } from "@theholocron/cli";
import { createGitHubClient, type GitHubClient } from "@theholocron/github-client";

import { resolveAdminToken, resolveIssuesToken, resolveReadToken, type ResolveTokenInput } from "./auth.js";
import { GitHubCi } from "./capabilities/ci.js";
import { GitHubEnvironments } from "./capabilities/environments.js";
import { GitHubIssues, type IssuesOptions } from "./capabilities/issues.js";
import { GitHubSecrets } from "./capabilities/secrets.js";
import { GitHubSource } from "./capabilities/source.js";

export interface GitHubPluginOptions extends ResolveTokenInput {
	/** "owner/name" — e.g., "theholocron/holocron". Required. */
	repo: string;
	/** Absolute path to the working repo root. Used by `source`'s
	 * workflow-file methods. Defaults to `process.cwd()`. */
	repoRoot?: string;
	/** Lifecycle slot → label name. Used by the `issues` capability. */
	labels?: { inProgress: string; inReview: string };
	/** Override base URL for tests. Defaults to https://api.github.com. */
	baseUrl?: string;
	/** Override `fetch` for tests. Defaults to global `fetch`. */
	fetch?: typeof fetch;
}

export interface PluginContext {
	options: GitHubPluginOptions;
	client: GitHubClient;
	repo: string;
	repoRoot: string;
}

// ── Capability factories ──────────────────────────────────────────────

export function source(ctx: PluginContext): Source {
	return new GitHubSource(ctx.client, { repo: ctx.repo, repoRoot: ctx.repoRoot });
}

export function secrets(ctx: PluginContext): Secrets {
	return new GitHubSecrets(ctx.client, { repo: ctx.repo });
}

export function environments(ctx: PluginContext): Environments {
	return new GitHubEnvironments(ctx.client, { repo: ctx.repo });
}

export function ci(ctx: PluginContext): Ci {
	return new GitHubCi(ctx.client, { repo: ctx.repo });
}

export function issues(ctx: PluginContext): Issues {
	const opts: IssuesOptions = { repo: ctx.repo };
	if (ctx.options.labels !== undefined) opts.labels = ctx.options.labels;
	return new GitHubIssues(ctx.client, opts);
}

// ── Plugin barrel for the core loader ─────────────────────────────────

export function createPlugin(options: GitHubPluginOptions) {
	function makeCtx(resolver: (input: ResolveTokenInput) => string): PluginContext {
		const token = resolver(options);
		const client = createGitHubClient({
			token,
			baseUrl: options.baseUrl,
			fetch: options.fetch,
		});
		return {
			options,
			client,
			repo: options.repo,
			repoRoot: options.repoRoot ?? process.cwd(),
		};
	}

	return {
		name: "@theholocron/holocron-plugin-github",
		capabilities: {
			source: () => source(makeCtx(resolveAdminToken)),
			ci: () => ci(makeCtx(resolveReadToken)),
			secrets: () => secrets(makeCtx(resolveAdminToken)),
			environments: () => environments(makeCtx(resolveAdminToken)),
			issues: () => issues(makeCtx(resolveIssuesToken)),
		},
	};
}

/**
 * One-line hint printed by `holocron auth set github` when no token
 * is supplied or the supplied token is rejected.
 */
export const AUTH_HINT =
	"generate fine-grained Personal Access Tokens at https://github.com/settings/tokens " +
	"(one per feature — see docs/tokens.md for required scopes per operation), " +
	"then run: holocron auth set github.<feature> <PAT>";

// ── Public re-exports ─────────────────────────────────────────────────

export type { Auth };
export * from "./auth.js";
export { createGitHubClient } from "./rest.js";
export { encryptSecret } from "./sodium.js";
export { GitHubSource } from "./capabilities/source.js";
export { GitHubSecrets } from "./capabilities/secrets.js";
export { GitHubEnvironments } from "./capabilities/environments.js";
export { GitHubCi } from "./capabilities/ci.js";
export { GitHubIssues } from "./capabilities/issues.js";
export { syncLabels } from "./capabilities/labels.js";
export type { CanonicalLabel } from "./capabilities/labels.js";
export { syncTeams, normalizeTeamEntry } from "./capabilities/teams.js";
export type { TeamEntry, TeamPermission, NormalizedTeamEntry } from "./capabilities/teams.js";
export { verifyToken } from "./verify-token.js";
export type { VerifyTokenResult, VerifyTokenSuccess, VerifyTokenFailure } from "./verify-token.js";
