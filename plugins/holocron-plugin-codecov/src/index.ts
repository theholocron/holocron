/**
 * `@theholocron/holocron-plugin-codecov` — entrypoint.
 *
 * Implements the `coverage` capability against Codecov's REST API (`checkToken`), and exports the token declaration and
 * the `token` probe. See the README for auth, config and what a Codecov token can be checked for.
 */

import type { Coverage, CoverageExpectations } from "@theholocron/cli";
import { connectionProbe, coverageExpectations } from "@theholocron/cli";

import { resolveApiToken, resolveToken, type ResolveTokenInput } from "./auth.js";
import { CodecovCoverage } from "./capabilities/coverage.js";
import { repoProbe } from "./probes/repo/repo.js";
import { tokenProbe } from "./probes/token/token.js";
import { type CodecovClient, createCodecovClient } from "./rest.js";
import { type CodecovTargetOptions, describeTarget, resolveTarget } from "./target.js";

/** Options for the Codecov plugin: token resolution, the repository and test overrides. */
export interface CodecovPluginOptions extends ResolveTokenInput, CodecovTargetOptions {
	/** Override base URL for tests. */
	baseUrl?: string;
	/** Override `fetch` for tests. */
	fetch?: typeof fetch;
	/** The workspace root, which the CLI passes to every plugin: where the repo check reads the flags and components from. */
	repoRoot?: string;
	/** `repoValidation.docsCoverage` of the config, which the CLI passes: `warn` or `required` adds the `documentation` flag. */
	docsCoverage?: "off" | "warn" | "required";
	/** Override the flags and components the repo check expects (tests); default: what `holocron sync` writes. */
	expected?: () => CoverageExpectations;
}

/** What the plugin's capability and probes share: the options and lazily built clients. */
export interface PluginContext {
	/** The options the plugin was created with. */
	options: CodecovPluginOptions;
	/** Builds the client on first call and reuses it; the token is resolved then, not at plugin load. */
	client: () => CodecovClient;
	/**
	 * Builds a client with the Codecov API token (`HOLOCRON_CODECOV_API_TOKEN`) that the repo check needs, and throws an
	 * `AuthError` when there is none. It never uses `--token` (that is the upload token) or the upload token.
	 */
	apiClient: () => CodecovClient;
}

/** Creates the shared context for the given options; no token is resolved until `client()` or `apiClient()` is first called. */
export function createContext(options: CodecovPluginOptions = {}): PluginContext {
	let client: CodecovClient | undefined;
	let apiClient: CodecovClient | undefined;
	return {
		apiClient: () =>
			(apiClient ??= createCodecovClient({
				token: resolveApiToken({
					...(options.env ? { env: options.env } : {}),
					...(options.keyring ? { keyring: options.keyring } : {}),
				}),
				baseUrl: options.baseUrl,
				fetch: options.fetch,
			})),
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
	return new CodecovCoverage(ctx.client, resolveTarget(ctx.options), ctx.apiClient);
}

/** Creates the Codecov plugin: its `connection`, `repo` and `token` probes and the `coverage` capability. */
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
			repo: repoProbe({
				coverage: () => coverage(ctx),
				expected: () =>
					options.expected
						? options.expected()
						: coverageExpectations(options.repoRoot ?? process.cwd(), options.docsCoverage ?? "off"),
				repo: target ? describeTarget(target) : undefined,
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
