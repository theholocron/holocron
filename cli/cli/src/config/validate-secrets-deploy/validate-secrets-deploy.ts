import { ConfigError } from "@theholocron/kyber/config";

import { isUnsyncedLayer, unsyncedLayerMessage } from "../../credentials-environments/unsynced-layer/index.js";
import type { RepoSecrets } from "../config/index.js";
import { validateEnvironmentChoice } from "../validate-environment-choice/index.js";

/**
 * Check `repo.secrets.deploy`: each entry names a vault environment (or a `layer`) and at least one of a non-empty `keys` list and a
 * non-empty `prefix`. An entry with neither would mean "all keys", which a deployment never gets (spec
 * `tech-deployment-key-allowlist`, #2061), so it is an error here and not a silent skip.
 *
 * @param secrets - `repo.secrets`, if the config has it.
 * @throws {ConfigError} Naming the first problem found.
 */
export function validateSecretsDeploy(secrets: RepoSecrets | undefined): void {
	for (const entry of secrets?.deploy ?? []) {
		const named = validateEnvironmentChoice(entry, "a `repo.secrets.deploy` entry");
		const label = `\`repo.secrets.deploy\` entry for ${JSON.stringify(named)}`;
		if (isUnsyncedLayer(entry.layer)) throw new ConfigError(unsyncedLayerMessage(label, entry.layer));
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
