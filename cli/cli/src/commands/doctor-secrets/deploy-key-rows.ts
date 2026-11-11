import type { CheckRow } from "@theholocron/kyber/ui";
import { describeError } from "@theholocron/kyber/ui";

import type { RepoSecretsDeploy } from "../../config/index.js";
import type { Vault } from "../../plugin/index.js";
import { missingTokenReason } from "../missing-token/index.js";
import { deployFilter } from "../secrets-sync/deploy-filter/index.js";
import { splitDeployKeys } from "../secrets-sync/split-deploy-keys/index.js";

/**
 * One row per vault environment `repo.secrets.deploy` names: the key names a deployment or Worker would receive from
 * a `secrets sync`, and how many the filter keeps back, so a token that should not go out is visible before the
 * sync. Names only: the values the vault returns are dropped at once. An environment that cannot be listed (no vault,
 * no token, an error) is a skipped row with the reason, never a failure.
 *
 * @param entries - `repo.secrets.deploy`.
 * @param vault - The `vault` provider, or why there is none.
 */
export async function deployKeyRows(entries: RepoSecretsDeploy[], vault: Vault | { why: string }): Promise<CheckRow[]> {
	const rows: CheckRow[] = [];
	for (const environment of [...new Set(entries.map((entry) => entry.environment))]) {
		const id = `deploy-${environment}`;
		const title = `${environment} deployment receives only its keys`;
		const skip = (detail: string) => rows.push({ id, title, status: "skip", detail, problems: [] });
		const filter = deployFilter(entries, environment)!;
		if ("why" in vault) {
			skip(vault.why);
		} else if (!vault.readEnvironment) {
			skip(`vault provider (${vault.providerName}) cannot list an environment's keys`);
		} else {
			try {
				const names = Object.keys(await vault.readEnvironment(environment)).sort();
				const { send, filtered } = splitDeployKeys(names, filter);
				const sends = send.filter((name) => names.includes(name));
				rows.push({
					id,
					title,
					status: "ok",
					detail: `sends ${sends.length} of ${names.length}: ${sends.join(", ") || "(none)"}${
						filtered.length > 0 ? `; keeps back ${filtered.length}: ${filtered.join(", ")}` : ""
					}`,
					problems: [],
				});
			} catch (err) {
				skip(
					missingTokenReason(err) ?? `could not read vault environment ${environment}: ${describeError(err)}`
				);
			}
		}
	}
	return rows;
}
