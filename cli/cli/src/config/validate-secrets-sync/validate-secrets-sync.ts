import type { RepoSecrets } from "../config/index.js";
import { validateEnvironmentChoice } from "../validate-environment-choice/index.js";

/**
 * Check `repo.secrets.sync`: each entry names its vault environment one way, a literal `environment` or a `layer`
 * (spec `tech-environment-layers`, #2069).
 *
 * @param secrets - `repo.secrets`, if the config has it.
 * @throws {ConfigError} Naming the first problem found.
 */
export function validateSecretsSync(secrets: RepoSecrets | undefined): void {
	for (const entry of secrets?.sync ?? []) validateEnvironmentChoice(entry, "a `repo.secrets.sync` entry");
}
