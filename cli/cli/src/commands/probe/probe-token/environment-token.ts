import { ENVIRONMENT_LAYERS, isEnvironmentLayer } from "../../../credentials-environments/index.js";
import { resolveEnvironmentId } from "../../secrets-sync/resolve-environment-id/index.js";
import type { EnvironmentToken, EnvironmentTokenInput } from "./probe-token.type.js";

/**
 * The provider's API token as held in one vault Environment, read in memory. Only an Environment this repo uses is
 * read: a layer word (`local`, `dev`, `ci`, `prod`) is this repo's `<org/repo> - <layer>`, and any other text must be a
 * name the config already names (`configured`), so a probe cannot be pointed at an Environment the repo has nothing to
 * do with. `local` reads the way the CLI does, `- local` over `- dev`, and `- local` may be absent.
 *
 * The variables looked for are the ones the provider's plugin lists (`HOLOCRON_CLOUDFLARE_TOKEN`, then the vendor's own
 * `CLOUDFLARE_API_TOKEN`); the first that holds a value wins.
 *
 * @throws {Error} When the name is not one of this repo's, no vault that reads an Environment is configured, or the
 * Environment holds none of the variables.
 */
export async function environmentToken(input: EnvironmentTokenInput): Promise<EnvironmentToken> {
	if (!isEnvironmentLayer(input.environment) && !input.configured.includes(input.environment)) {
		const known = [...ENVIRONMENT_LAYERS, ...input.configured];
		throw new Error(
			`${input.environment} is not an Environment this repo's config names; use one of: ${known.join(", ")}`
		);
	}
	const read = input.vault?.readEnvironment?.bind(input.vault);
	if (!read) {
		throw new Error(
			"--environment needs a vault provider that can read an Environment (1Password); none is configured"
		);
	}
	const at = { repoRoot: input.repoRoot, gitExec: input.gitExec };
	const environment = await resolveEnvironmentId(input.environment, at);
	let values: Record<string, string>;
	if (input.environment === "local") {
		// The CLI reads `- local` over `- dev`; only `- local` may be missing.
		const dev = await read(await resolveEnvironmentId("dev", at));
		const local = await read(environment).catch(() => ({}) as Record<string, string>);
		values = { ...dev, ...local };
	} else {
		values = await read(environment);
	}
	const names = input.tokens.flatMap((t) => [t.envName, ...(t.vendorEnvName ? [t.vendorEnvName] : [])]);
	if (names.length === 0) throw new Error(`the ${input.provider} plugin lists no token to look for`);
	for (const variable of names) {
		const token = values[variable];
		if (token) return { token, environment, variable };
	}
	throw new Error(`${environment} holds none of ${names.join(", ")}`);
}
