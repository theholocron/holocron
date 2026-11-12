import { ConfigError } from "@theholocron/kyber/config";

import { isUnsyncedLayer, unsyncedLayerMessage } from "../../credentials-environments/unsynced-layer/index.js";
import type { RepoSecrets } from "../config/index.js";
import { validateEnvironmentChoice } from "../validate-environment-choice/index.js";

/**
 * Check `repo.secrets.sync`: each entry names its vault environment one way, a literal `environment` or a `layer`
 * (spec `tech-environment-layers`, #2069). An organization
 * scope must say who can read the secrets: `visibility: "selected"` (or left out) and a non-empty `repos` list. A
 * concealed value is never readable by every repository, so `visibility: "all"` and `"private"` are errors, and an
 * entry with no list does not load (spec `tech-org-secret-visibility`, #2062). `repos` and `visibility` mean nothing
 * on another scope, so they are errors there. A repository name is `name` or `<org>/name` of the scope's own
 * organization, and one key may not be given two different reader lists at the same organization.
 *
 * @param secrets - `repo.secrets`, if the config has it.
 * @throws {ConfigError} Naming the first problem found.
 */
export function validateSecretsSync(secrets: RepoSecrets | undefined): void {
	const readers = new Map<string, string>();
	for (const entry of secrets?.sync ?? []) {
		const named = validateEnvironmentChoice(entry, "a `repo.secrets.sync` entry");
		const label = `\`repo.secrets.sync\` entry for ${JSON.stringify(named)}`;
		if (isUnsyncedLayer(entry.layer)) throw new ConfigError(unsyncedLayerMessage(label, entry.layer));
		const scope = entry.scope ?? "repo";
		if (!scope.startsWith("org=")) {
			if (entry.visibility !== undefined || entry.repos !== undefined) {
				throw new ConfigError(
					`${label} sets \`visibility\` or \`repos\` on scope ${JSON.stringify(scope)}: only an organization scope ("org=<name>") has readers to name`
				);
			}
			continue;
		}
		const org = scope.slice("org=".length);
		if (entry.visibility !== undefined && entry.visibility !== "selected") {
			throw new ConfigError(
				`${label} has visibility ${JSON.stringify(entry.visibility)}: a secret is never readable by every repository, so use "selected" with \`repos\``
			);
		}
		const { repos } = entry;
		if (
			!Array.isArray(repos) ||
			repos.length === 0 ||
			repos.some((r) => typeof r !== "string" || !/^(?:[^/]+\/)?[^/]+$/.test(r))
		) {
			throw new ConfigError(
				`${label} needs \`repos\`, a non-empty list of the repositories (\`name\` or \`<org>/name\`) that can read the secrets: an organization secret is never readable by every repository`
			);
		}
		const names = repos.map((r) => {
			const slash = r.indexOf("/");
			const owner = slash < 0 ? org : r.slice(0, slash);
			if (owner !== org) {
				throw new ConfigError(
					`${label} lists repository ${JSON.stringify(r)}: use a name in ${JSON.stringify(org)}, such as "holocron"`
				);
			}
			return r.slice(slash + 1);
		});
		const list = [...new Set(names)].sort().join(", ");
		for (const key of entry.keys ?? []) {
			const id = `${org}/${key.toUpperCase()}`;
			const seen = readers.get(id);
			if (seen !== undefined && seen !== list) {
				throw new ConfigError(
					`${label} lists ${key}, which another \`repo.secrets.sync\` entry at org=${org} gives different readers [${seen}]: a secret has one reader list`
				);
			}
			readers.set(id, list);
		}
	}
}
