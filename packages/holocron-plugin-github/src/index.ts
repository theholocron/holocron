/**
 * `@theholocron/holocron-plugin-github` — entrypoint.
 *
 * Holocron loads a plugin by resolving its package and reading the
 * default export, which is a `Plugin` object declaring which
 * capabilities it implements. The factory for each capability
 * receives plugin-level options from `holocron.config.json` and
 * returns the bound implementation.
 */

import type { Auth, Ci, Environments, Issues, RestClient, Secrets, Source } from "@theholocron/cli";

import { resolveToken, type ResolveTokenInput } from "./auth.js";
import { GitHubCi } from "./capabilities/ci.js";
import { GitHubEnvironments } from "./capabilities/environments.js";
import { GitHubIssues, type IssuesOptions } from "./capabilities/issues.js";
import { GitHubSecrets } from "./capabilities/secrets.js";
import { GitHubSource } from "./capabilities/source.js";
import { createGitHubRestClient } from "./rest.js";

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
	rest: RestClient;
	repo: string;
	repoRoot: string;
}

export function createContext(options: GitHubPluginOptions): PluginContext {
	const token = resolveToken(options);
	const rest = createGitHubRestClient({
		token,
		baseUrl: options.baseUrl,
		fetch: options.fetch,
	});
	return {
		options,
		rest,
		repo: options.repo,
		repoRoot: options.repoRoot ?? process.cwd(),
	};
}

// ── Capability factories ──────────────────────────────────────────────

export function source(ctx: PluginContext): Source {
	return new GitHubSource(ctx.rest, { repo: ctx.repo, repoRoot: ctx.repoRoot });
}

export function secrets(ctx: PluginContext): Secrets {
	return new GitHubSecrets(ctx.rest, { repo: ctx.repo });
}

export function environments(ctx: PluginContext): Environments {
	return new GitHubEnvironments(ctx.rest, { repo: ctx.repo });
}

export function ci(ctx: PluginContext): Ci {
	return new GitHubCi(ctx.rest, { repo: ctx.repo });
}

export function issues(ctx: PluginContext): Issues {
	const opts: IssuesOptions = { repo: ctx.repo };
	if (ctx.options.labels !== undefined) opts.labels = ctx.options.labels;
	return new GitHubIssues(ctx.rest, opts);
}

// ── Plugin barrel for the core loader ─────────────────────────────────

export function createPlugin(options: GitHubPluginOptions) {
	const ctx = createContext(options);
	return {
		name: "@theholocron/holocron-plugin-github",
		capabilities: {
			source: () => source(ctx),
			ci: () => ci(ctx),
			secrets: () => secrets(ctx),
			environments: () => environments(ctx),
			issues: () => issues(ctx),
		},
	};
}

/**
 * One-line hint printed by `holocron auth set github` when no token
 * is supplied or the supplied token is rejected. Generate a PAT at
 * https://github.com/settings/tokens with `repo` + `admin:repo_hook`
 * scopes (add `admin:org` for org-level operations).
 */
export const AUTH_HINT =
	"generate a Personal Access Token at https://github.com/settings/tokens " +
	"(scopes: repo, admin:repo_hook — plus admin:org for org-level ops), " +
	"then run: holocron auth set github <PAT>";

// ── Public re-exports ─────────────────────────────────────────────────

export type { Auth };
export * from "./auth.js";
export { createGitHubRestClient } from "./rest.js";
export { encryptSecret } from "./sodium.js";
export { GitHubSource } from "./capabilities/source.js";
export { GitHubSecrets } from "./capabilities/secrets.js";
export { GitHubEnvironments } from "./capabilities/environments.js";
export { GitHubCi } from "./capabilities/ci.js";
export { GitHubIssues } from "./capabilities/issues.js";
export { syncLabels } from "./capabilities/labels.js";
export type { CanonicalLabel } from "./capabilities/labels.js";
export { verifyToken } from "./verify-token.js";
export type { VerifyTokenResult, VerifyTokenSuccess, VerifyTokenFailure } from "./verify-token.js";
