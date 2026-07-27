/**
 * `@theholocron/holocron-plugin-postman` — entrypoint.
 *
 * Implements the `tooling` capability against Postman's REST API.
 * See README for auth + config docs.
 */

import type { Tooling } from "@theholocron/cli";

import { resolveToken, type ResolveTokenInput } from "./auth.js";
import { PostmanTooling, type PostmanToolingOptions } from "./capabilities/tooling.js";
import { createPostmanClient, type PostmanClient } from "./rest.js";

export interface PostmanPluginOptions extends ResolveTokenInput, PostmanToolingOptions {
	/** Working repo root. Used to resolve relative paths in specFile/envFiles. Defaults to process.cwd(). */
	repoRoot?: string;
	/** Override base URL for tests. */
	baseUrl?: string;
	/** Override `fetch` for tests. */
	fetch?: typeof fetch;
}

export interface PluginContext {
	options: PostmanPluginOptions;
	client: PostmanClient;
}

export function createContext(options: PostmanPluginOptions): PluginContext {
	if (!options.workspaceId) {
		throw new Error("@theholocron/holocron-plugin-postman requires `workspaceId` in options");
	}
	const token = resolveToken(options);
	return {
		options,
		client: createPostmanClient({ token, baseUrl: options.baseUrl, fetch: options.fetch }),
	};
}

export function tooling(ctx: PluginContext): Tooling {
	const opts: PostmanToolingOptions = { workspaceId: ctx.options.workspaceId };
	if (ctx.options.specFile !== undefined) opts.specFile = ctx.options.specFile;
	if (ctx.options.specName !== undefined) opts.specName = ctx.options.specName;
	if (ctx.options.collectionName !== undefined) opts.collectionName = ctx.options.collectionName;
	if (ctx.options.envFiles !== undefined) opts.envFiles = ctx.options.envFiles;
	if (ctx.options.repoRoot !== undefined) opts.repoRoot = ctx.options.repoRoot;
	return new PostmanTooling(ctx.client, opts);
}

export function createPlugin(options: PostmanPluginOptions) {
	const ctx = createContext(options);
	return {
		name: "@theholocron/holocron-plugin-postman",
		capabilities: {
			tooling: () => tooling(ctx),
		},
	};
}

/**
 * One-line hint printed by `holocron auth set postman` when no
 * token is supplied or the supplied token is rejected.
 */
export const AUTH_HINT =
	"generate a Postman API key at https://postman.co/settings/me/api-keys, " +
	"then run: holocron auth set postman <KEY>";

// ── Public re-exports ────────────────────────────────────────────────

export * from "./auth.js";
export { PostmanTooling } from "./capabilities/tooling.js";
export type { PostmanClient, PostmanClientOptions } from "./rest.js";
export { createPostmanClient,detectPlanLimit, PostmanPlanLimitError } from "./rest.js";
export type { VerifyTokenFailure,VerifyTokenResult, VerifyTokenSuccess } from "./verify-token.js";
export { verifyToken } from "./verify-token.js";
