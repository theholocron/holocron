/**
 * `@theholocron/holocron-plugin-codecov` — entrypoint.
 *
 * Implements the `coverage` capability against Codecov's REST API (`checkToken`), and exports the token declaration and
 * the `token` probe. See the README for auth, config and what a Codecov token can be checked for.
 */

import type { Coverage } from "@theholocron/cli";
import { connectionProbe } from "@theholocron/cli";

import { resolveToken, type ResolveTokenInput } from "./auth.js";
import { CodecovCoverage } from "./capabilities/coverage.js";
import { tokenProbe } from "./probes/token/token.js";
import { type CodecovClient, createCodecovClient } from "./rest.js";
import { type CodecovTargetOptions, describeTarget, resolveTarget } from "./target.js";

/** Options for the Codecov plugin: token resolution, the repository and test overrides. */
export interface CodecovPluginOptions extends ResolveTokenInput, CodecovTargetOptions {
	/** Override base URL for tests. */
	baseUrl?: string;
	/** Override `fetch` for tests. */
	fetch?: typeof fetch;
}

/** What the plugin's capability and probes share: the options and a lazily built client. */
export interface PluginContext {
	/** The options the plugin was created with. */
	options: CodecovPluginOptions;
	/** Builds the client on first call and reuses it; the token is resolved then, not at plugin load. */
	client: () => CodecovClient;
}

/** Creates the shared context for the given options; no token is resolved until `client()` is first called. */
export function createContext(options: CodecovPluginOptions = {}): PluginContext {
	let client: CodecovClient | undefined;
	return {
		options,
		client: () =>
			(client ??= createCodecovClient({
				token: resolveToken(options),
				baseUrl: options.baseUrl,
				fetch: options.fetch,
			})),
	};
}

/** Builds the `coverage` capability from a plugin context. */
export function coverage(ctx: PluginContext): Coverage {
	return new CodecovCoverage(ctx.client, resolveTarget(ctx.options));
}

/** Creates the Codecov plugin: its `connection` and `token` probes and the `coverage` capability. */
export function createPlugin(options: CodecovPluginOptions = {}) {
	const ctx = createContext(options);
	const target = resolveTarget(options);
	return {
		name: "@theholocron/holocron-plugin-codecov",
		probes: {
			// The upload token the workflows use is not one the REST API takes, so this only checks that there is one to use.
			connection: connectionProbe({
				provider: "Codecov",
				token: () => resolveToken(options),
				verify: async () => ({
					ok: true,
					subject: "a token is set (see `probe codecov token` for what can be checked)",
				}),
			}),
			token: tokenProbe({
				token: () => resolveToken(options),
				coverage: () => coverage(ctx),
				repo: target ? describeTarget(target) : undefined,
			}),
		},
		capabilities: {
			coverage: () => coverage(ctx),
		},
	};
}

// ── Public re-exports ────────────────────────────────────────────────

export * from "./auth.js";
export { CodecovCoverage } from "./capabilities/coverage.js";
export { type CodecovClient, type CodecovClientOptions, createCodecovClient } from "./rest.js";
export { type CodecovTarget, type CodecovTargetOptions, resolveTarget } from "./target.js";
