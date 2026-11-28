/** The Environments the config names, and the ones that are instances of one GitHub App. */
export interface OwnerEnvironments {
	/** Every Environment the config names, once each, in the order it names them. */
	names: string[];
	/** The `githubApps` Environments: they hold the same names by design, so they count as one place. */
	instances: Set<string>;
}
