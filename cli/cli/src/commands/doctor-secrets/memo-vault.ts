import type { Vault } from "../../plugin/index.js";

/**
 * A vault that reads each Environment once. `doctor secrets` asks about the same Environment for several rows and for
 * the matrix; a provider that shells out (1Password) should not be asked again each time. An error is remembered too,
 * so a refused read is refused once. Only the provider's own methods are used; nothing is written.
 *
 * @param vault - The `vault` provider.
 * @returns A vault that answers `readEnvironment` from memory after the first read of an Environment, or the same vault
 *   when it cannot read one.
 */
export function memoVault(vault: Vault): Vault {
	const read = vault.readEnvironment;
	if (!read) return vault;
	const seen = new Map<string, Promise<Record<string, string>>>();
	const memo = Object.create(vault) as Vault;
	memo.readEnvironment = (environmentId: string) => {
		let result = seen.get(environmentId);
		if (!result) {
			result = read.call(vault, environmentId);
			seen.set(environmentId, result);
		}
		return result;
	};
	return memo;
}
