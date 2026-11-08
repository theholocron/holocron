/** How many providers a capability resolves to: one (`"single"`) or several active at once (`"many"`). */
export type Cardinality = "single" | "many";

/**
 * The capabilities of a CLI as a type: each key maps to its cardinality and to the interface a provider implements.
 * It exists only at the type level; it types `loader.get(key)` so a `single` key hands back one implementation and a
 * `many` key an array.
 * Declare it as a `type` alias, not an `interface` (an interface has no index signature).
 *
 * @example
 * type MyCapabilities = {
 *   source: { cardinality: "single"; impl: Source };
 *   notifications: { cardinality: "many"; impl: Notifier };
 * };
 */
export type CapabilityShape = Record<string, { cardinality: Cardinality; impl: unknown }>;

/** The capability keys of a {@link CapabilityShape}. */
export type CapabilityKeyOf<Caps extends CapabilityShape> = Extract<keyof Caps, string>;

/** What `loader.get(key)` returns for `key`: one implementation for a `single` capability, an array for a `many`. */
export type ResolvedCapability<
	Caps extends CapabilityShape,
	K extends CapabilityKeyOf<Caps>,
> = Caps[K]["cardinality"] extends "many" ? Caps[K]["impl"][] : Caps[K]["impl"];

/** A provider with its plugin package resolved. */
export interface ProviderTuple {
	/** The provider's short name, e.g. `github`. */
	provider: string;
	/** The package that implements it, e.g. `@acme/mycli-plugin-github`. */
	packageName: string;
	/** Options the config gives this provider. */
	options: Record<string, unknown>;
}

/** What a capability is configured with: one provider, or a list of them. */
export type ProviderEntry =
	{ cardinality: "single"; tuple: ProviderTuple } | { cardinality: "many"; tuples: ProviderTuple[] };

/** Imports a package by name. Injectable, so tests need no real packages installed. */
export type PluginImporter = (packageName: string) => Promise<unknown>;

/**
 * What a plugin's `createPlugin(options)` returns: a name, a factory per capability it implements, and whatever else
 * the CLI lets a plugin carry (`Extra`, e.g. probes).
 */
export type LoadedPlugin<Caps extends CapabilityShape, Extra extends object = Record<never, never>> = {
	/** The plugin's name. */
	name: string;
	/** A factory for each capability the plugin implements; the loader calls the one it needs. */
	capabilities: Partial<{ [K in CapabilityKeyOf<Caps>]: () => unknown }>;
} & Extra;

/** The shape a plugin package must export: `createPlugin(options)`. */
export interface PluginModule<Caps extends CapabilityShape, Extra extends object = Record<never, never>> {
	/** Builds the plugin from the merged options. */
	createPlugin: (options: Record<string, unknown>) => LoadedPlugin<Caps, Extra>;
}

/** The default export of a capability config package: a provider and the preset options to start it with. */
export interface CapabilityConfigPackage {
	/** The provider's short name or package. */
	provider: string;
	/** Preset options; the project's own options for the provider win over them. */
	options?: Record<string, unknown>;
}

/** A provider that could not be loaded: a missing package, a bad token, an unimplemented capability. */
export interface PluginLoadFailure<Key extends string = string> {
	/** The capability that was being loaded. */
	key: Key;
	/** The provider's short name. */
	provider: string;
	/** The package that failed. */
	packageName: string;
	/** What went wrong. */
	error: Error;
}

/** The part of a loader {@link assertPluginsResolvable} reads. Every `PluginLoader` satisfies it. */
export interface PluginLoadReport {
	/** The capability keys that loaded. */
	loadedKeys(): readonly string[];
	/** The providers that failed to load. */
	loadFailures(): readonly PluginLoadFailure[];
}

/** What a {@link PluginSystemOptions.preload} step can do to the loader while it runs. */
export interface PreloadApi<Caps extends CapabilityShape> {
	/** Load one provider (import, `createPlugin`, capability factory) and return its implementation. Throws on failure. */
	loadOne(key: CapabilityKeyOf<Caps>, tuple: ProviderTuple): Promise<unknown>;
	/** Record a provider as failed, so `get` and `loadFailures` report it, and carry on. */
	fail(key: CapabilityKeyOf<Caps>, tuple: ProviderTuple, err: unknown): void;
	/** Put the loaded implementations of a capability in the registry. */
	register(key: CapabilityKeyOf<Caps>, impls: unknown): void;
}

/** A step that runs before the providers load, and that loads some capabilities itself. */
export interface PreloadStep<Caps extends CapabilityShape, Config, Context, LoadOptions> {
	/** The capabilities the step loads, so the normal loop skips them. */
	keys: readonly CapabilityKeyOf<Caps>[];
	/** Runs once at the start of `load()`. */
	run(
		api: PreloadApi<Caps>,
		input: { config: Config; context: Context; options: LoadOptions | undefined }
	): Promise<void> | void;
}

/** What {@link createPluginSystem} needs to build a CLI's plugin loader. */
export interface PluginSystemOptions<
	Caps extends CapabilityShape,
	Config,
	Context extends object,
	LoadOptions = undefined,
> {
	/** What a short provider name is prefixed with to get its package, e.g. `@acme/mycli-plugin-`. */
	packagePrefix: string;
	/** The prefix of an unscoped third-party plugin package, e.g. `mycli-plugin-`; such names are used as they are. */
	communityPrefix?: string;
	/** The name of the config file, for the message when a capability is asked for and was never configured. */
	configFile?: string;
	/** Reads the resolved provider entries, by capability, out of the CLI's config. */
	providers: (config: Config) => Partial<{ [K in CapabilityKeyOf<Caps>]: ProviderEntry }>;
	/**
	 * The options handed to `createPlugin` for one provider. Defaults to the context spread first and the provider's own
	 * options over it. Return what you want, with the provider's `tuple.options` last so they win.
	 */
	pluginOptions?: (input: { config: Config; context: Context; tuple: ProviderTuple }) => Record<string, unknown>;
	/** A step that loads some capabilities before the rest (for example credentials that other plugins read). */
	preload?: PreloadStep<Caps, Config, Context, LoadOptions>;
}

/** The loader a CLI builds with {@link createPluginSystem}. */
export interface PluginLoader<
	Caps extends CapabilityShape,
	Extra extends object = Record<never, never>,
> extends PluginLoadReport {
	/**
	 * Imports every configured plugin and builds the capability registry. Never throws for one plugin's failure: it is
	 * recorded in {@link PluginLoader.loadFailures} and the load continues, so a command learns a capability is absent
	 * from `has()` / `get()`.
	 */
	load(): Promise<void>;
	/** The implementation of a capability: one for a `single` key, an array for a `many` key. Throws when it did not load. */
	get<K extends CapabilityKeyOf<Caps>>(key: K): ResolvedCapability<Caps, K>;
	/** Whether a capability has loaded. */
	has(key: CapabilityKeyOf<Caps>): boolean;
	/** Every capability key that has loaded. */
	loadedKeys(): CapabilityKeyOf<Caps>[];
	/** The providers that failed to load. Empty on a clean load. */
	loadFailures(): readonly PluginLoadFailure<CapabilityKeyOf<Caps>>[];
	/** The plugin object of each provider that was created, by provider name. */
	plugins(): ReadonlyMap<string, LoadedPlugin<Caps, Extra>>;
	/**
	 * Imports one provider and builds its plugin with the given options, without any capability slot: nothing is added to
	 * the registry, and the plugin is recorded in {@link PluginLoader.plugins} (replacing one of the same provider that
	 * `load()` made). Throws {@link LoaderError} when the package cannot be imported or is not a plugin, and whatever
	 * `createPlugin` throws. For a command that works on a provider the config does not name.
	 */
	loadProvider(tuple: ProviderTuple): Promise<LoadedPlugin<Caps, Extra>>;
}

/** The class {@link createPluginSystem} returns; extend it or construct it directly. */
export interface PluginLoaderConstructor<
	Caps extends CapabilityShape,
	Config,
	Context extends object,
	Extra extends object = Record<never, never>,
	LoadOptions = undefined,
> {
	/**
	 * @param config - The resolved config.
	 * @param context - Per-run context every plugin receives in its options.
	 * @param importer - Imports a package by name; defaults to resolving from the current directory first.
	 * @param options - Passed to the {@link PluginSystemOptions.preload} step.
	 */
	new (config: Config, context: Context, importer?: PluginImporter, options?: LoadOptions): PluginLoader<Caps, Extra>;
}

/** What {@link createPluginSystem} returns. */
export interface PluginSystem<
	Caps extends CapabilityShape,
	Config,
	Context extends object,
	Extra extends object = Record<never, never>,
	LoadOptions = undefined,
> {
	/** The loader class, bound to this CLI's prefix, config shape and hooks. */
	PluginLoader: PluginLoaderConstructor<Caps, Config, Context, Extra, LoadOptions>;
	/** Turn a provider's short name into its package name with this CLI's prefixes. */
	resolvePackage: (provider: string) => string;
}
