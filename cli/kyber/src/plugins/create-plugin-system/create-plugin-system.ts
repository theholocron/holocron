import { defaultImporter } from "../default-importer/index.js";
import { LoaderError } from "../loader-error/index.js";
import { resolvePluginPackage } from "../resolve-plugin-package/index.js";
import type {
	CapabilityConfigPackage,
	CapabilityKeyOf,
	CapabilityShape,
	LoadedPlugin,
	PluginImporter,
	PluginLoader,
	PluginLoadFailure,
	PluginModule,
	PluginSystem,
	PluginSystemOptions,
	PreloadApi,
	ProviderEntry,
	ProviderTuple,
	ResolvedCapability,
} from "./create-plugin-system.type.js";

function messageOf(err: unknown): string {
	return err instanceof Error ? err.message : String(err);
}

function isPluginModule<Caps extends CapabilityShape, Extra extends object>(
	mod: unknown
): mod is PluginModule<Caps, Extra> {
	return typeof (mod as { createPlugin?: unknown } | null)?.createPlugin === "function";
}

function isCapabilityConfigModule(mod: unknown): mod is { default: CapabilityConfigPackage } {
	const def = (mod as { default?: unknown } | null)?.default;
	return typeof (def as CapabilityConfigPackage | null | undefined)?.provider === "string";
}

/**
 * Build the plugin system of a new CLI: a loader that reads the providers from your config, imports each one's package
 * (resolving from the working directory first), calls its `createPlugin(options)` and keeps the capabilities it
 * implements in a typed registry, `single` or `many` per capability.
 *
 * A package may also export a capability config (`export default { provider, options? }`); the loader follows it to the
 * provider and merges the preset options under the project's own. A provider that fails to load is recorded and
 * skipped, never thrown, so one missing token does not stop a command that does not need it.
 *
 * What is yours stays yours: the capability interfaces (the `Caps` type), the package prefix, how the config lists
 * providers and what a plugin is handed. Nothing about credentials, tokens or `.env` files is built in; a CLI that
 * wants them uses `pluginOptions` and the `preload` step.
 *
 * @example
 * const { PluginLoader } = createPluginSystem<MyCapabilities, MyConfig, MyContext>({
 *   packagePrefix: "@acme/mycli-plugin-",
 *   providers: (config) => config.providers,
 * });
 * const loader = new PluginLoader(config, { repoRoot });
 * await loader.load();
 * const source = loader.get("source");
 */
export function createPluginSystem<
	Caps extends CapabilityShape,
	Config,
	Context extends object,
	Extra extends object = Record<never, never>,
	LoadOptions = undefined,
>(
	options: PluginSystemOptions<Caps, Config, Context, LoadOptions>
): PluginSystem<Caps, Config, Context, Extra, LoadOptions> {
	type Key = CapabilityKeyOf<Caps>;
	const { packagePrefix, communityPrefix, configFile = "the config", providers, pluginOptions, preload } = options;
	const resolvePackage = (provider: string): string => resolvePluginPackage(provider, packagePrefix, communityPrefix);

	class Loader implements PluginLoader<Caps, Extra> {
		private readonly registry = new Map<Key, unknown>();
		private readonly failures: PluginLoadFailure<Key>[] = [];
		private readonly created = new Map<string, LoadedPlugin<Caps, Extra>>();

		constructor(
			private readonly config: Config,
			private readonly context: Context,
			private readonly importer: PluginImporter = defaultImporter,
			private readonly loadOptions?: LoadOptions
		) {}

		async load(): Promise<void> {
			const skip = new Set<string>(preload?.keys ?? []);
			if (preload) {
				const api: PreloadApi<Caps> = {
					loadOne: (key, tuple) => this.loadOne(key, tuple),
					fail: (key, tuple, err) => this.recordFailure(key, tuple, err),
					register: (key, impls) => void this.registry.set(key, impls),
				};
				await preload.run(api, {
					config: this.config,
					context: this.context,
					options: this.loadOptions,
				});
			}

			const entries = Object.entries(providers(this.config)) as Array<[Key, ProviderEntry | undefined]>;
			for (const [key, entry] of entries) {
				if (!entry || skip.has(key)) continue;
				if (entry.cardinality === "single") {
					try {
						this.registry.set(key, await this.loadOne(key, entry.tuple));
					} catch (err) {
						this.recordFailure(key, entry.tuple, err);
					}
				} else {
					const impls: unknown[] = [];
					for (const tuple of entry.tuples) {
						try {
							impls.push(await this.loadOne(key, tuple));
						} catch (err) {
							this.recordFailure(key, tuple, err);
						}
					}
					if (impls.length > 0) this.registry.set(key, impls);
				}
			}
		}

		get<K extends Key>(key: K): ResolvedCapability<Caps, K> {
			const impl = this.registry.get(key);
			if (impl === undefined) {
				// A provider that was configured but failed re-surfaces its own error (a missing token, say), which is more
				// useful to the person than a generic "not loaded".
				const failure = this.failures.find((f) => f.key === key);
				if (failure) throw failure.error;
				throw new LoaderError(`capability \`${key}\` is not loaded — is it declared in ${configFile}?`);
			}
			return impl as ResolvedCapability<Caps, K>;
		}

		has(key: Key): boolean {
			return this.registry.has(key);
		}

		loadedKeys(): Key[] {
			return Array.from(this.registry.keys());
		}

		loadFailures(): readonly PluginLoadFailure<Key>[] {
			return this.failures;
		}

		plugins(): ReadonlyMap<string, LoadedPlugin<Caps, Extra>> {
			return this.created;
		}

		private recordFailure(key: Key, tuple: ProviderTuple, err: unknown): void {
			this.failures.push({
				key,
				provider: tuple.provider,
				packageName: tuple.packageName,
				error: err instanceof Error ? err : new Error(String(err)),
			});
		}

		async loadProvider(tuple: ProviderTuple): Promise<LoadedPlugin<Caps, Extra>> {
			return this.instantiate("provider", tuple);
		}

		private async loadOne(key: Key, tuple: ProviderTuple): Promise<unknown> {
			const plugin = await this.instantiate(`capability \`${key}\``, tuple);
			const factory = plugin.capabilities[key];
			if (typeof factory !== "function") {
				throw new LoaderError(`\`${tuple.packageName}\` does not implement the \`${key}\` capability`);
			}
			return factory();
		}

		/** Imports the package and builds the plugin (following a capability config package to its provider). */
		private async instantiate(subject: string, tuple: ProviderTuple): Promise<LoadedPlugin<Caps, Extra>> {
			const mod = await this.importer(tuple.packageName).catch((err: unknown) => {
				throw new LoaderError(`failed to import \`${tuple.packageName}\` for ${subject}: ${messageOf(err)}`);
			});

			if (isPluginModule<Caps, Extra>(mod)) {
				const plugin = mod.createPlugin(
					pluginOptions
						? pluginOptions({ config: this.config, context: this.context, tuple })
						: { ...this.context, ...tuple.options }
				);
				this.created.set(tuple.provider, plugin);
				return plugin;
			}

			// A capability config package: follow it to the provider, with its preset options under the project's own
			// (the same precedence as ESLint's `extends`).
			if (isCapabilityConfigModule(mod)) {
				const cap = mod.default;
				return this.instantiate(subject, {
					provider: cap.provider,
					packageName: resolvePackage(cap.provider),
					options: { ...cap.options, ...tuple.options },
				});
			}

			throw new LoaderError(
				`\`${tuple.packageName}\` does not export \`createPlugin(options)\` or a capability config ({ provider, options? })`
			);
		}
	}

	return { PluginLoader: Loader, resolvePackage };
}
