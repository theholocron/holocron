import { describeError } from "@theholocron/kyber/ui";

import { type ResolvedHolocronConfig, resolvePluginPackage } from "../../../config/index.js";
import { assertPluginsResolvable, PluginLoader } from "../../../plugin/index.js";
import type { OpenSideInput, Side } from "./open-side.type.js";

/**
 * Loads one provider for a migration. `issues` is a single provider in a config, so each side gets its own loader over
 * a copy of the config whose `providers` hold only this endpoint (and the `credentials` providers, so its token is found); the repo's own entry for the same provider (its
 * `repo`, `team`, lifecycle labels) is the base the endpoint's options are laid over.
 */
export async function openSide(input: OpenSideInput): Promise<Side> {
	const { endpoint, capabilities } = input;
	const base = input.loaded.resolved.providers;
	const providers: ResolvedHolocronConfig["providers"] = {};
	for (const key of [...capabilities, ...(input.optional ?? [])]) {
		const own = base[key];
		const ownOptions =
			own?.cardinality === "single" && own.tuple.provider === endpoint.provider ? own.tuple.options : {};
		providers[key] = {
			cardinality: "single",
			tuple: {
				provider: endpoint.provider,
				packageName: resolvePluginPackage(endpoint.provider),
				options: { ...ownOptions, ...endpoint.options },
			},
		};
	}
	// The `credentials` providers are how this machine reads its tokens (a 1Password Environment, #1606); a side that
	// lost them could not find a token the rest of the CLI finds.
	if (base.credentials) providers.credentials = base.credentials;
	const resolved = { ...input.loaded.resolved, providers };
	const loader = input.makeLoader?.(resolved, input.context) ?? new PluginLoader(resolved, input.context);
	await loader.load();
	assertPluginsResolvable(loader, input.command ?? "migrate");

	const side: Side = { ok: true, provider: endpoint.provider };
	for (const key of capabilities) {
		if (!loader.has(key)) {
			const failure = loader.loadFailures().find((f) => f.key === key);
			return {
				ok: false,
				reason: `the \`${key}\` capability of \`${endpoint.provider}\` is not available${failure ? ` (${describeError(failure.error)})` : ""}`,
			};
		}
		if (key === "issues") side.issues = loader.get("issues");
		else side.projects = loader.get("projects");
	}
	if (input.optional?.includes("projects") && loader.has("projects")) side.projects = loader.get("projects");
	return side;
}
