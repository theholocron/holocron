/**
 * `PluginLoader` — loads provider plugins per the resolved config and
 * builds a typed capability registry the runtime can query.
 *
 * The generic machinery (walking the providers, dynamic-importing a package, calling `createPlugin(options)`,
 * the single / many registry, capability config packages, resolving from the working directory first) is
 * `createPluginSystem` from `@theholocron/kyber/plugins`. This file binds it to Holocron: the
 * `@theholocron/holocron-plugin-<provider>` prefix, where the config lists the providers, the options a plugin is
 * handed (project defaults, the runtime context, the per-plugin token) and the credentials step that runs first.
 *
 * Loader keeps NO knowledge of vendor tokens. Each plugin reads its
 * own env vars (`HOLOCRON_ADMIN_TOKEN`, `HOLOCRON_VERCEL_TOKEN`, etc.)
 * inside its `createPlugin`. That keeps the loader vendor-agnostic
 * and the auth story per-plugin explicit.
 *
 * `importer` is injectable so tests don't need real network or
 * sibling packages installed.
 */

import { createPluginSystem, LoaderError } from "@theholocron/kyber/plugins";
import { DOTENV_FILE, hasCredentials, readDotenvFile, setCredentials } from "@theholocron/kyber/secrets";

import {
	credentialsEnvironment,
	type ProviderOptions,
	type ResolvedHolocronConfig,
} from "../../config/config/index.js";
import { type CapabilityKey, CARDINALITY, type CardinalityFor, type Credentials } from "../capabilities/index.js";
import type { PluginProbes } from "../probe/index.js";
import type { ProviderActions } from "../provider-actions/index.js";
import { WorkspaceContextError } from "../workspace/index.js";
import type { HolocronCapabilities, PluginExtras, PluginLoaderOptions, RuntimeContext } from "./loader.type.js";

export { LoaderError };

const system = createPluginSystem<
	HolocronCapabilities,
	ResolvedHolocronConfig,
	RuntimeContext,
	PluginExtras,
	PluginLoaderOptions
>({
	packagePrefix: "@theholocron/holocron-plugin-",
	communityPrefix: "holocron-plugin-",
	configFile: "holocron.config.json",
	providers: (config) => config.providers,
	pluginOptions: ({ config, context, tuple }) => {
		// Resolve the effective token for this specific plugin.
		// cliTokens[provider] wins over the bare cliToken fallback.
		const effectiveToken = context.cliTokens?.[tuple.provider] ?? context.cliToken;
		// Precedence (later wins): project-level defaults from config → runtime context (CLI flags: --repo, --token) →
		// per-plugin resolved token → tuple options (per-plugin overrides in config). cliTokens is explicitly cleared so
		// the map never reaches plugins. See `docs/wiki/specifications/tech-setup-and-config.spec.md` §Design.
		return {
			...(config.repo?.name ? { repo: config.repo.name } : {}),
			...context,
			...(effectiveToken !== undefined ? { cliToken: effectiveToken } : {}),
			cliTokens: undefined,
			...tuple.options,
		};
	},
	preload: {
		keys: ["credentials"],
		// The repo's `.env` and then the `credentials` providers go first: what they return is where the other plugins
		// find their tokens, and the file is listed first so it wins over a provider.
		async run(api, { config, context, options }) {
			// `<repoRoot>/.env` is optional and needs no config; read into the credential store once per process.
			const source = `${DOTENV_FILE}:${context.repoRoot}`;
			if (!hasCredentials(source)) {
				const variables = readDotenvFile(context.repoRoot);
				if (variables) setCredentials(source, variables);
			}

			// Each `credentials` provider's environment is read into the store once per process: a second loader finds the
			// source already there and does not ask again, so a provider that prompts (Touch ID) prompts once. A provider
			// that fails to load or to read is recorded and skipped.
			const entry = config.providers.credentials;
			if (!entry || entry.cardinality !== "many") return;
			const impls: Credentials[] = [];
			for (const tuple of entry.tuples) {
				try {
					const environment = credentialsEnvironment(tuple, config);
					if (!environment) {
						throw new LoaderError(
							`the ${tuple.provider} credentials provider has no \`environment\` option and \`credentials.environment\` is not set`
						);
					}
					const impl = (await api.loadOne("credentials", tuple)) as Credentials;
					impls.push(impl);
					const sourceName = `${tuple.provider}:${environment}`;
					// `readCredentials: false` loads the providers without asking them for a single value (`doctor credentials`).
					if (options?.readCredentials !== false && !hasCredentials(sourceName)) {
						setCredentials(sourceName, await impl.read(environment));
					}
				} catch (err) {
					api.fail("credentials", tuple, err);
				}
			}
			if (impls.length > 0) api.register("credentials", impls);
		},
	},
});

/** The Holocron plugin loader: `new PluginLoader(config, context, importer?, options?)`, then `load()`, `get(key)`. */
export class PluginLoader extends system.PluginLoader {
	/** The probes each loaded provider offers, by provider name. Empty for a provider that offers none. */
	probes(): ReadonlyMap<string, PluginProbes> {
		const found = new Map<string, PluginProbes>();
		for (const [provider, plugin] of this.plugins()) {
			if (plugin.probes && Object.keys(plugin.probes).length > 0) found.set(provider, plugin.probes);
		}
		return found;
	}

	/** The `setup` and `doctor` each loaded provider offers, by provider name. A provider with neither is left out. */
	providerActions(): ReadonlyMap<string, ProviderActions> {
		const found = new Map<string, ProviderActions>();
		for (const [provider, plugin] of this.plugins()) {
			const actions = actionsOf(plugin);
			if (actions.setup || actions.doctor) found.set(provider, actions);
		}
		return found;
	}

	/**
	 * Loads one provider by name with the given options, whether or not `holocron.config` names it under a capability,
	 * and returns its `setup` and `doctor` (either may be missing). It reads the provider's token the way a configured
	 * one does (`--token`, the environment, `.env`, the `credentials` providers, the keyring) and leaves the capability
	 * registry alone. Throws {@link WorkspaceContextError} when the provider's package cannot be imported here; any
	 * other failure of the plugin's `createPlugin` is thrown as it is.
	 */
	async loadProviderActions(provider: string, options: ProviderOptions): Promise<ProviderActions> {
		const packageName = system.resolvePackage(provider);
		try {
			return actionsOf(await this.loadProvider({ provider, packageName, options }));
		} catch (err) {
			if (err instanceof LoaderError && err.message.startsWith("failed to import")) {
				throw new WorkspaceContextError("provider", [packageName]);
			}
			throw err;
		}
	}
}

/** The `setup` and `doctor` a created plugin carries. */
function actionsOf(plugin: PluginExtras): ProviderActions {
	return {
		...(plugin.setup ? { setup: plugin.setup } : {}),
		...(plugin.doctor ? { doctor: plugin.doctor } : {}),
	};
}

/** Convenience re-export so callers can compute counts without importing CARDINALITY directly. */
export function cardinalityOf<K extends CapabilityKey>(key: K): CardinalityFor<K> {
	return CARDINALITY[key];
}
