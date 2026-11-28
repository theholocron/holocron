import { describeError } from "@theholocron/kyber/ui";

import type { ResolvedTuple } from "../../config/index.js";
import { providerTuples } from "../provider-tuples/index.js";
import { workspaceProviders } from "../workspace-providers/index.js";
import type { ResolvedRelaySourceProvider, ResolveRelaySourceProviderInput } from "./relay-sources.type.js";

/**
 * The provider that makes a relay source's webhook: the configured provider of its `capability`, or, when the source
 * names a `provider` (spec `tech-relay-source-provider`), that plugin loaded by name beside the configured ones.
 *
 * - No `provider`: the configured provider of the capability (a problem when there is none).
 * - `provider` equal to the configured one: that same provider, loaded once.
 * - Any other: the plugin is loaded with the options of the first provider entry that names it, the root config's (for
 *   another capability) then a workspace package's (`apps/sentinel` names `vercel`), through
 *   `PluginLoader.loadNamedCapability`; the registry, the cardinality rules and what the root deploys are untouched. A
 *   plugin no config names, that does not resolve, that fails to build or that lacks `ensureRelaySource` is a
 *   `problem` that names it, never a throw, so the caller can refuse before it writes.
 *
 * Reads the workspace's package configs and loads a plugin; creates no webhook and calls no vendor.
 */
export async function resolveRelaySourceProvider(
	input: ResolveRelaySourceProviderInput
): Promise<ResolvedRelaySourceProvider> {
	const { loader, source } = input;
	const { id, spec } = source;
	const configured = loader.has(spec.capability) ? loader.get(spec.capability) : undefined;
	if (spec.provider === undefined || configured?.providerName === spec.provider) {
		return configured
			? { provider: configured }
			: { problem: `relay source \`${id}\`: no \`${spec.capability}\` provider is configured` };
	}
	const named = spec.provider;
	const tuple = await optionsFor(named, input);
	if (!tuple) {
		return {
			problem: `relay source \`${id}\`: provider \`${named}\` is named by no \`holocron.config\` here, so there are no options to load it with — name it in the config of the package that uses it`,
		};
	}
	let made: unknown;
	try {
		made = await loader.loadNamedCapability(named, tuple.options, spec.capability);
	} catch (err) {
		return {
			problem: `relay source \`${id}\`: provider \`${named}\` (${tuple.packageName}) could not be loaded for \`${spec.capability}\`: ${describeError(err)}`,
		};
	}
	const provider = made as NonNullable<ResolvedRelaySourceProvider["provider"]>;
	if (typeof provider.ensureRelaySource !== "function") {
		return {
			problem: `relay source \`${id}\`: provider \`${named}\` cannot make a relay webhook (its \`${spec.capability}\` has no \`ensureRelaySource\`)`,
		};
	}
	return { provider };
}

/** The tuple that supplies the named plugin's options: the root config's entry, else the first workspace package's. */
async function optionsFor(name: string, input: ResolveRelaySourceProviderInput): Promise<ResolvedTuple | undefined> {
	const root = providerTuples(input.config.providers).find((t) => t.provider === name);
	if (root) return root;
	const read = input.workspace ?? workspaceProviders;
	return (await read(input.repoRoot, input.config)).find((t) => t.provider === name);
}
