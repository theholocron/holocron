/** The names one vault environment may send to a deployment or a Worker: an exact name, or a prefix, either. */
export interface DeployFilter {
	/** Exact key names. */
	keys: string[];
	/** Name prefixes. */
	prefixes: string[];
}

/** A vault environment's keys, split by a {@link DeployFilter}. Names only. */
export interface DeployKeySplit {
	/** The keys to send: the vault's keys that pass, then any listed key the vault does not hold. */
	send: string[];
	/** The vault's keys that pass nothing, in order. Never sent. */
	filtered: string[];
}
