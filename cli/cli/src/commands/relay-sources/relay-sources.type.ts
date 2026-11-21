import type { ResolvedHolocronConfig, ResolvedTuple } from "../../config/index.js";
import type {
	NotificationsChannelLayout,
	NotificationsLayout,
	NotificationsPicture,
	NotificationsRelaySource,
	PluginLoader,
	ProviderIdentity,
	RelaySourceMethods,
} from "../../plugin/index.js";

/** A channel that carries one relay source, as the layout declares it (`feeds.relay.<id>`). */
export interface GenericRelayFeed {
	/** The source's id: the path the relay serves it at and the name of its Worker bindings. */
	source: string;
	/** The channel that carries it. */
	channel: NotificationsChannelLayout;
	/** The feed as written. */
	feed: true | { webhook?: string; avatar?: NotificationsPicture };
	/** The name of the channel's dedicated webhook for it. */
	webhook: string;
}

/** A source declared in `relay.sources`, with its id. */
export interface DeclaredRelaySource {
	id: string;
	spec: NotificationsRelaySource;
}

/** The provider of a source's capability, as far as the relay cares. */
export type RelaySourceProvider = ProviderIdentity & RelaySourceMethods;

/** What {@link resolveRelaySourceProvider} reads. */
export interface ResolveRelaySourceProviderInput {
	/** The loader holding the configured providers; the named plugin is loaded through it. */
	loader: PluginLoader;
	/** The resolved root config: its provider entries supply a named plugin's options first. */
	config: ResolvedHolocronConfig;
	/** The repository root, where the workspace's package configs are read from. */
	repoRoot: string;
	/** The source to resolve. */
	source: DeclaredRelaySource;
	/** Reads the providers the workspace's packages name. Defaults to `workspaceProviders()`; tests pass their own. */
	workspace?: (repoRoot: string, config: ResolvedHolocronConfig) => Promise<ResolvedTuple[]>;
}

/** The outcome of {@link resolveRelaySourceProvider}: the provider, or why there is none. */
export interface ResolvedRelaySourceProvider {
	/** The provider that makes the webhook, when there is one. */
	provider?: RelaySourceProvider;
	/** Why there is none: names the source and the plugin, ready to print as a refusal. */
	problem?: string;
}

/** The `print` and counters `setup notifications` passes a step. */
export interface RelaySourceRun {
	print: (line: string) => void;
	/** Counted as in the rest of `setup`: `true` for a change, `false` for a no-op. */
	made: (changed: boolean) => void;
	dryRun: boolean;
}

/** What `ensureRelaySource` hands back. */
export interface EnsuredRelaySource {
	/** The secret the Worker verifies this vendor's requests with, when the provider made or set one now. A credential. */
	secret?: string;
	/** Steps the vendor's API cannot do. The caller reports each and the run fails until they are done. */
	todo: string[];
}

/** What `relaySourceChecks` reads. */
export interface RelaySourceChecksInput {
	layout: NotificationsLayout;
	/**
	 * Finds the provider that makes a source's webhook, the way `setup notifications` does (`resolveRelaySourceProvider()`),
	 * or says why there is none: the reason its row skips.
	 */
	resolve: (source: DeclaredRelaySource) => Promise<ResolvedRelaySourceProvider>;
}
