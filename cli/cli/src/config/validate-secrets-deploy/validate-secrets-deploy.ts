import { ConfigError } from "@theholocron/kyber/config";

import type { RepoSecrets } from "../config/index.js";

/**
 * Check `repo.secrets.deploy`: each entry names a vault environment and at least one of a non-empty `keys` list and a
 * non-empty `prefix`. An entry with neither would mean "all keys", which a deployment never gets (spec
 * `tech-deployment-key-allowlist`, #2061), so it is an error here and not a silent skip.
 *
 * @param secrets - `repo.secrets`, if the config has it.
 * @throws {ConfigError} Naming the first problem found.
 */
export function validateSecretsDeploy(secrets: RepoSecrets | undefined): void {
	for (const entry of secrets?.deploy ?? []) {
		if (typeof entry.environment !== "string" || entry.environment.trim() === "") {
			throw new ConfigError("a `repo.secrets.deploy` entry needs the name of a vault environment");
		}
		const label = `\`repo.secrets.deploy\` entry for ${JSON.stringify(entry.environment)}`;
		const { keys, prefix } = entry;
		if (keys !== undefined && (!Array.isArray(keys) || keys.some((k) => typeof k !== "string" || k === ""))) {
			throw new ConfigError(`${label} has \`keys\` that is not a list of key names`);
		}
		if (prefix !== undefined && (typeof prefix !== "string" || prefix === "")) {
			throw new ConfigError(`${label} has an empty \`prefix\``);
		}
		if ((keys === undefined || keys.length === 0) && prefix === undefined) {
			throw new ConfigError(
				`${label} needs \`keys\` (a list of names) or \`prefix\` (such as "SENTINEL_"): a deployment never receives every key`
			);
		}
	}
}
