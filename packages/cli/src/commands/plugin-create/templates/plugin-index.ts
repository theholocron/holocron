import type { TemplateInputs } from "../template-inputs.js";

export function render(inputs: TemplateInputs): string {
	const clientClass = `${inputs.vendorName}RestClient`;
	// Camel-case capability name is used as the factory function name.
	const capabilityInterface = inputs.capability.charAt(0).toUpperCase() + inputs.capability.slice(1);
	return `/**
 * \`@theholocron/holocron-plugin-${inputs.slug}\` — entrypoint.
 *
 * Implements the \`${inputs.capability}\` capability against ${inputs.vendorName}'s
 * REST API. Also exports \`verifyToken\` + \`AUTH_HINT\` for
 * \`holocron auth\`. See README for auth + config docs.
 *
 * TODO: once you fill in the ${inputs.capabilityClass} methods and add
 * \`implements ${capabilityInterface}\` to the class, add the type import:
 *   import type { ${capabilityInterface} } from "@theholocron/cli";
 * and set \`: ${capabilityInterface}\` as the factory return type below.
 */

import { resolveToken, type ResolveTokenInput } from "./auth.js";
import { ${inputs.capabilityClass} } from "./capabilities/${inputs.capability}.js";
import { ${clientClass} } from "./rest.js";

export interface ${inputs.vendorName}PluginOptions extends ResolveTokenInput {
	/** Override base URL for tests. */
	baseUrl?: string;
	/** Override \`fetch\` for tests. */
	fetch?: typeof fetch;
}

export interface PluginContext {
	options: ${inputs.vendorName}PluginOptions;
	rest: ${clientClass};
}

export function createContext(options: ${inputs.vendorName}PluginOptions): PluginContext {
	const token = resolveToken(options);
	const restOpts: ConstructorParameters<typeof ${clientClass}>[0] = { token };
	if (options.baseUrl !== undefined) restOpts.baseUrl = options.baseUrl;
	if (options.fetch !== undefined) restOpts.fetch = options.fetch;
	return {
		options,
		rest: new ${clientClass}(restOpts),
	};
}

export function ${inputs.capability}(ctx: PluginContext) {
	// Return type inferred at scaffold time — the class doesn't yet
	// \`implements ${capabilityInterface}\`. Add the type import + the
	// \`: ${capabilityInterface}\` annotation once methods are stubbed.
	return new ${inputs.capabilityClass}(ctx.rest);
}

export function createPlugin(options: ${inputs.vendorName}PluginOptions) {
	const ctx = createContext(options);
	return {
		name: "@theholocron/holocron-plugin-${inputs.slug}",
		capabilities: {
			${inputs.capability}: () => ${inputs.capability}(ctx),
		},
	};
}

/**
 * One-line hint printed by \`holocron auth set ${inputs.slug}\` when no
 * token is supplied or the supplied token is rejected. Edit this to
 * point operators at the specific ${inputs.vendorName} docs path for
 * generating a token.
 */
export const AUTH_HINT =
	"generate a ${inputs.vendorName} API token, then run: holocron auth set ${inputs.slug} <TOKEN>";

// ── Public re-exports ────────────────────────────────────────────────

export * from "./auth.js";
export { ${clientClass} } from "./rest.js";
export { ${inputs.capabilityClass} } from "./capabilities/${inputs.capability}.js";
export { verifyToken } from "./verify-token.js";
export type { VerifyTokenResult, VerifyTokenSuccess, VerifyTokenFailure } from "./verify-token.js";
`;
}
