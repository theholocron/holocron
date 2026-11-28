import { ConfigError } from "@theholocron/kyber/config";

/**
 * The vault Environment a loaded config entry names. `loadConfig()` has already turned every `layer` into an
 * `environment` (`resolveLayers()`), so a missing one means the config did not come through it; that is an error, never
 * a guess (spec `tech-environment-layers`, #2069).
 *
 * @param entry - A `repo.secrets.sync`, `repo.secrets.deploy`, `repo.variables.sync` or `githubApps` entry.
 * @throws {ConfigError} When the entry still has no `environment`.
 */
export function resolvedEnvironment(entry: { environment?: string; layer?: string }): string {
	if (entry.environment === undefined) {
		throw new ConfigError(
			`an entry names the layer ${JSON.stringify(entry.layer)} but its Environment was not derived: load the config with loadConfig()`
		);
	}
	return entry.environment;
}
