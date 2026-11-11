import { credentialsEnvironment, type ResolvedHolocronConfig, type ResolvedProviderEntry } from "../../config/index.js";

/** The Environments the check reads, and the ones that are instances of one GitHub App. */
export interface OwnerEnvironments {
	/** Every Environment the config names, once each, in the order it names them. */
	names: string[];
	/** The `githubApps` Environments: they hold the same names by design, so they count as one place. */
	instances: Set<string>;
}

/**
 * The Environments the config names: each `credentials` provider's, `githubApps[].environment`, `dev.environment`
 * and the one of every `repo.secrets.sync` and `repo.variables.sync` entry.
 */
export function ownerEnvironments(config: ResolvedHolocronConfig): OwnerEnvironments {
	const names = new Set<string>();
	const entry = config.providers.credentials as Extract<ResolvedProviderEntry, { cardinality: "many" }> | undefined;
	for (const tuple of entry?.tuples ?? []) {
		// A provider that derives its names (#2063) has no literal one here; the redesign of this check covers those.
		const named = credentialsEnvironment(tuple, config);
		if (named !== undefined) names.add(named);
	}
	const instances = new Set((config.githubApps ?? []).map((app) => app.environment));
	for (const environment of instances) names.add(environment);
	if (config.dev?.environment) names.add(config.dev.environment);
	for (const sync of [...(config.repo?.secrets?.sync ?? []), ...(config.repo?.variables?.sync ?? [])]) {
		names.add(sync.environment);
	}
	return { names: [...names], instances };
}
