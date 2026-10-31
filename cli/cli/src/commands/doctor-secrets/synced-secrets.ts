import { parseScope } from "../../cli-support/index.js";
import type { RepoSecretsSync } from "../../config/index.js";
import { type SecretScope, type Vault } from "../../plugin/index.js";
import { describeProviderError } from "../../ui/provider-error/index.js";
import type { CheckRow } from "../doctor-checks/index.js";
import { missingTokenReason } from "../missing-token/index.js";
import type { SyncedSecrets } from "./doctor-secrets.type.js";

/**
 * The secrets `holocron secrets sync` fills from a vault, as `repo.secrets.sync` declares them: which names land at
 * which scope. An entry that lists `keys` needs no vault. One that does not asks the vault which keys the environment
 * holds, and only the names are kept: the values the provider returns are dropped at once and never logged or printed.
 * An entry that cannot be resolved (no vault, no token, an environment the vault cannot list) is a skipped row with
 * the reason, and an unreadable `scope` is a failed one.
 *
 * @param entries - `repo.secrets.sync`.
 * @param vault - The `vault` provider, or why there is none.
 */
export async function syncedSecrets(
	entries: RepoSecretsSync[],
	vault: Vault | { why: string }
): Promise<SyncedSecrets> {
	const scopes: SyncedSecrets["scopes"] = [];
	const rows: CheckRow[] = [];
	for (const entry of entries) {
		const id = `sync-${entry.environment}`;
		const title = `${entry.environment} vault environment is synced`;
		let scope: SecretScope;
		try {
			scope = parseScope(entry.scope ?? "repo");
		} catch (err) {
			rows.push({ id, title, status: "fail", detail: "1 problem(s)", problems: [describeProviderError(err)] });
			continue;
		}
		if (entry.keys) {
			scopes.push({ scope, names: entry.keys });
			continue;
		}
		const skip = (detail: string) => rows.push({ id, title, status: "skip", detail, problems: [] });
		if ("why" in vault) {
			skip(vault.why);
		} else if (!vault.readEnvironment) {
			skip(`vault provider (${vault.providerName}) cannot list an environment's keys`);
		} else {
			try {
				scopes.push({ scope, names: Object.keys(await vault.readEnvironment(entry.environment)) });
			} catch (err) {
				skip(
					missingTokenReason(err) ??
						`could not read vault environment ${entry.environment}: ${describeProviderError(err)}`
				);
			}
		}
	}
	return { scopes, rows };
}
