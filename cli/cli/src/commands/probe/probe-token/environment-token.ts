import { resolveEnvironmentId } from "../../secrets-sync/resolve-environment-id/index.js";
import type { EnvironmentToken, EnvironmentTokenInput } from "./probe-token.type.js";

/**
 * The provider's API token as held in one vault Environment, read in memory: `ci` (or any layer word) is this repo's
 * `<org/repo> - ci`, any other text a literal name. The variables looked for are the ones the provider's plugin lists
 * (`HOLOCRON_CLOUDFLARE_TOKEN`, then the vendor's own `CLOUDFLARE_API_TOKEN`); the first that holds a value wins.
 *
 * @throws {Error} When no vault that reads an Environment is configured, or the Environment holds none of the variables.
 */
export async function environmentToken(input: EnvironmentTokenInput): Promise<EnvironmentToken> {
	const read = input.vault?.readEnvironment?.bind(input.vault);
	if (!read) {
		throw new Error(
			"--environment needs a vault provider that can read an Environment (1Password); none is configured"
		);
	}
	const environment = await resolveEnvironmentId(input.environment, { repoRoot: input.repoRoot });
	const values = await read(environment);
	const names = input.tokens.flatMap((t) => [t.envName, ...(t.vendorEnvName ? [t.vendorEnvName] : [])]);
	if (names.length === 0) throw new Error(`the ${input.provider} plugin lists no token to look for`);
	for (const variable of names) {
		const token = values[variable];
		if (token) return { token, environment, variable };
	}
	throw new Error(`${environment} holds none of ${names.join(", ")}`);
}
