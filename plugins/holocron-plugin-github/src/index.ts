/**
 * `@theholocron/holocron-plugin-github` — entrypoint.
 *
 * Holocron loads a plugin by resolving its package and reading the
 * default export, which is a `Plugin` object declaring which
 * capabilities it implements. The factory for each capability
 * receives plugin-level options from `holocron.config.json` and
 * returns the bound implementation.
 */

import type { Auth, Ci, Environments, Issues, PluginToken, Secrets, Source } from "@theholocron/cli";
import { connectionProbe } from "@theholocron/cli";
import { createGitHubClient, type GitHubClient } from "@theholocron/github-client";

import {
	AuthError,
	resolveAdminToken,
	resolveDeployToken,
	resolveIssuesToken,
	resolveOrgToken,
	resolveReadToken,
	resolveReleaseToken,
	resolveSecretsToken,
	resolveSyncToken,
	type ResolveTokenInput,
	resolveUserSyncToken,
} from "./auth.js";
import { GitHubCi } from "./capabilities/ci.js";
import { GitHubEnvironments } from "./capabilities/environments.js";
import { GitHubIssues, type IssuesOptions } from "./capabilities/issues.js";
import { GitHubSecrets } from "./capabilities/secrets.js";
import { GitHubSource } from "./capabilities/source.js";
import { verifyToken } from "./verify-token.js";

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

export function source(ctx: PluginContext, orgClient?: GitHubClient, userSyncClient?: GitHubClient): Source {
	return new GitHubSource(ctx.client, {
		repo: ctx.repo,
		repoRoot: ctx.repoRoot,
		orgClient,
		userSyncClient,
		baseUrl: ctx.options.baseUrl,
		fetch: ctx.options.fetch,
	});
}

export function secrets(ctx: PluginContext, orgClient?: GitHubClient): Secrets {
	return new GitHubSecrets(ctx.client, { repo: ctx.repo }, orgClient);
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

	/** A token, or undefined when that feature token is simply not configured. */
	function tryResolve(resolver: (input: ResolveTokenInput) => string): string | undefined {
		try {
			return resolver(options);
		} catch (err) {
			if (err instanceof AuthError) return undefined;
			throw err;
		}
	}

	/**
	 * Organization secrets need an org-resource-owner token (`github.secrets`);
	 * repo and environment secrets need `github.admin`. Each scope prefers its own
	 * token and falls back to the other, so a setup with only one of them keeps
	 * working, and an explicit `--token` serves both. With neither configured this
	 * fails exactly as the admin-token capabilities do.
	 */
	function makeSecrets(): Secrets {
		const secretsToken = tryResolve(resolveSecretsToken);
		const adminToken = tryResolve(resolveAdminToken);
		if (!secretsToken && !adminToken) resolveAdminToken(options); // throws the familiar AuthError
		const clientFor = (token: string) =>
			createGitHubClient({ token, baseUrl: options.baseUrl, fetch: options.fetch });
		const repoClient = clientFor((adminToken ?? secretsToken)!);
		const orgClient = clientFor((secretsToken ?? adminToken)!);
		return secrets(
			{ options, client: repoClient, repo: options.repo, repoRoot: options.repoRoot ?? process.cwd() },
			orgClient
		);
	}

	function makeOrgClient(): GitHubClient | undefined {
		try {
			const token = resolveOrgToken(options);
			return createGitHubClient({ token, baseUrl: options.baseUrl, fetch: options.fetch });
		} catch {
			return undefined;
		}
	}

	/** The token for the user-sync files; undefined when it is not configured, and the org token is used instead. */
	function makeUserSyncClient(): GitHubClient | undefined {
		const token = tryResolve(resolveUserSyncToken);
		return token ? createGitHubClient({ token, baseUrl: options.baseUrl, fetch: options.fetch }) : undefined;
	}

	return {
		name: "@theholocron/holocron-plugin-github",
		probes: {
			connection: connectionProbe({
				provider: "GitHub",
				url: options.baseUrl ?? "https://api.github.com",
				fetch: options.fetch,
				token: () => resolveReadToken(options),
				verify: (token) => verifyToken(token, { baseUrl: options.baseUrl, fetch: options.fetch }),
			}),
		},
		capabilities: {
			source: () => source(makeCtx(resolveAdminToken), makeOrgClient(), makeUserSyncClient()),
			ci: () => ci(makeCtx(resolveReadToken)),
			secrets: () => makeSecrets(),
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
export { GitHubCi } from "./capabilities/ci.js";
export { GitHubEnvironments } from "./capabilities/environments.js";
export { GitHubIssues } from "./capabilities/issues.js";
export type { CanonicalLabel } from "./capabilities/labels.js";
export { syncLabels } from "./capabilities/labels.js";
export { GitHubSecrets } from "./capabilities/secrets.js";
export { GitHubSource } from "./capabilities/source.js";
export type { NormalizedTeamEntry, TeamEntry, TeamPermission } from "./capabilities/teams.js";
export { normalizeTeamEntry, syncTeams } from "./capabilities/teams.js";
export { createGitHubClient, type GitHubClientOptions } from "./rest.js";
export { encryptSecret } from "./sodium.js";
export { verifyToken } from "./verify-token.js";

/** Every token this plugin takes, for `holocron doctor tokens`. */
export const tokens: PluginToken[] = [
	resolveReadToken,
	resolveIssuesToken,
	resolveSyncToken,
	resolveReleaseToken,
	resolveAdminToken,
	resolveSecretsToken,
	resolveDeployToken,
	resolveUserSyncToken,
	resolveOrgToken,
].map((resolver) => resolver.token);
export type { VerifyTokenFailure, VerifyTokenResult, VerifyTokenSuccess } from "@theholocron/cli";
