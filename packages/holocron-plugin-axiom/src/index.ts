/**
 * `@theholocron/holocron-plugin-axiom` — entrypoint.
 *
 * Implements the `logs` capability against Axiom's REST API. Also
 * exports `verifyToken` + `AUTH_HINT` for `holocron auth`. See README
 * for auth + config docs.
 */

import type { Logs } from "@theholocron/cli";

import { resolveToken, type ResolveTokenInput } from "./auth.js";
import { AxiomLogs, type AxiomLogsOptions } from "./capabilities/logs.js";
import { type AxiomRestClient, createAxiomClient } from "./rest.js";

export interface AxiomPluginOptions extends ResolveTokenInput, AxiomLogsOptions {
	/** Override base URL for tests. */
	baseUrl?: string;
	/** Override `fetch` for tests. */
	fetch?: typeof fetch;
}

export interface PluginContext {
	options: AxiomPluginOptions & { dataset?: string };
	client: AxiomRestClient;
}

export function createContext(options: AxiomPluginOptions): PluginContext {
	const token = resolveToken(options);
	const env = options.env ?? process.env;
	// `HOLOCRON_AXIOM_DATASET` is not a secret — resolve it like the token's
	// fallback chain but independently. Config (`dataset`) wins when set.
	const dataset = options.dataset ?? env.HOLOCRON_AXIOM_DATASET ?? env.AXIOM_DATASET;
	return {
		options: { ...options, dataset },
		client: createAxiomClient({ token, baseUrl: options.baseUrl, fetch: options.fetch }),
	};
}

export function logs(ctx: PluginContext): Logs {
	return new AxiomLogs(ctx.client, { dataset: ctx.options.dataset });
}

export function createPlugin(options: AxiomPluginOptions) {
	const ctx = createContext(options);
	return {
		name: "@theholocron/holocron-plugin-axiom",
		capabilities: {
			logs: () => logs(ctx),
		},
	};
}

/**
 * One-line hint shown by `holocron auth set axiom` when no token is
 * supplied or when the supplied token is rejected.
 */
export const AUTH_HINT =
	"generate an Axiom API token at https://app.axiom.co/settings/api-tokens " +
	"with dataset read + create permissions, then run: holocron auth set axiom <TOKEN>";

// ── Public re-exports ────────────────────────────────────────────────

export * from "./auth.js";
export { AxiomLogs, type AxiomLogsOptions } from "./capabilities/logs.js";
export {
	type AxiomClientOptions,
	type AxiomDataset,
	type AxiomRestClient,
	type AxiomUser,
	createAxiomClient,
} from "./rest.js";
export type { VerifyTokenFailure, VerifyTokenResult, VerifyTokenSuccess } from "./verify-token.js";
export { verifyToken } from "./verify-token.js";
