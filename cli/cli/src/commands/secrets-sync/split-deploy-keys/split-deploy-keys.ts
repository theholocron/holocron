import type { DeployFilter, DeployKeySplit } from "../deploy-filter/index.js";

/**
 * Split a vault environment's key names by what a deployment may receive. A key passes when it is listed or starts
 * with a prefix (case-sensitive). A listed key the vault does not hold stays in `send`, so the sync reports it as
 * missing rather than dropping it. Only names go in and out.
 *
 * @param vaultKeys - The names the vault environment holds.
 * @param filter - From `deployFilter()`.
 */
export function splitDeployKeys(vaultKeys: string[], filter: DeployFilter): DeployKeySplit {
	const passes = (key: string) => filter.keys.includes(key) || filter.prefixes.some((p) => key.startsWith(p));
	const send = vaultKeys.filter(passes);
	const filtered = vaultKeys.filter((key) => !passes(key));
	return { send: [...send, ...filter.keys.filter((key) => !vaultKeys.includes(key))], filtered };
}
