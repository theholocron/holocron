/** What `tryEnvironments()` found. */
export interface TriedEnvironments<T> {
	/** Each Environment that exists, in order, with what `attempt` returned for it. */
	found: { name: string; result: T }[];
	/** The required Environments that do not exist. Names only. */
	missing: string[];
}
