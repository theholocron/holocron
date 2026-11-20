import type {
	NotificationsChannelLayout,
	NotificationsLayout,
	NotificationsPicture,
	NotificationsRelaySource,
	ProviderIdentity,
	RelaySourceCapability,
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
	/** The configured provider of a capability, or undefined when there is none. */
	provider: (capability: RelaySourceCapability) => RelaySourceProvider | undefined;
	/** Why a capability has no provider: the reason its rows skip. */
	missingReason: (capability: RelaySourceCapability) => string;
}
