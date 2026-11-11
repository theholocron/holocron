/** What `tryEnvironments()` found. */
export interface TriedEnvironments<T> {
	/** Each Environment that exists, in order, with what `attempt` returned for it. `legacy` marks the migration fallback. */
	found: { name: string; legacy: boolean; result: T }[];
	/** The required Environments that do not exist and were not made up for by a legacy one. Names only. */
	missing: string[];
}
