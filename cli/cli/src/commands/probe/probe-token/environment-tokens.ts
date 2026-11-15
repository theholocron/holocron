import { ENVIRONMENT_LAYERS, isEnvironmentLayer } from "../../../credentials-environments/index.js";
import { resolveEnvironmentId } from "../../secrets-sync/resolve-environment-id/index.js";
import { HoldsNoTokenError } from "./holds-no-token-error.js";
import type { EnvironmentTokenInput, EnvironmentTokens } from "./probe-token.type.js";

/**
 * Every token the provider declares that one vault Environment holds, read in memory. Only an Environment this repo uses is
 * read: a layer word (`local`, `dev`, `ci`, `prod`) is this repo's `<org/repo> - <layer>`, and any other text must be a
 * name the config already names (`configured`), so a probe cannot be pointed at an Environment the repo has nothing to
 * do with. `local` reads the way the CLI does, `- local` over `- dev`, and `- local` may be absent.
 *
 * Each token the provider's plugin lists is looked for under its own variable (`HOLOCRON_SENTRY_TOKEN`), then the
 * vendor's (`vendorEnvName`); the first that holds a value is that token's. A token the Environment does not hold is in
 * `missing`, so the caller can report it by name. The Environment's other visible (not concealed) values come back as
 * `plain`, for the plugin's own settings (a dataset, an account id); a vault that cannot say which are visible gives none.
 *
 * @throws {Error} When the name is not one of this repo's, no vault that reads an Environment is configured, the plugin
 * lists no token, or the Environment holds none of them.
 */
export async function environmentTokens(input: EnvironmentTokenInput): Promise<EnvironmentTokens> {
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
	const readEntries = input.vault?.readEnvironmentEntries?.bind(input.vault);
	// What one Environment holds: every value, and the ones the vault says are visible (not concealed). A vault that
	// cannot tell holds no visible value, so only a value known to be plain ever reaches the plugin.
	const readOne = async (id: string): Promise<{ values: Record<string, string>; plain: Record<string, string> }> => {
		if (!readEntries) return { values: await read(id), plain: {} };
		const entries = await readEntries(id);
		return {
			values: Object.fromEntries(entries.map((e) => [e.name, e.value])),
			plain: Object.fromEntries(entries.filter((e) => !e.concealed).map((e) => [e.name, e.value])),
		};
	};
	let values: Record<string, string>;
	let plain: Record<string, string>;
	if (input.environment === "local") {
		// The CLI reads `- local` over `- dev`; only `- local` may be missing.
		const dev = await readOne(await resolveEnvironmentId("dev", at));
		const local = await readOne(environment).catch(() => ({ values: {}, plain: {} }));
		values = { ...dev.values, ...local.values };
		plain = { ...dev.plain, ...local.plain };
	} else {
		({ values, plain } = await readOne(environment));
	}
	if (input.tokens.length === 0) throw new Error(`the ${input.provider} plugin lists no token to look for`);
	const held: EnvironmentTokens["held"] = [];
	const missing: string[] = [];
	for (const declared of input.tokens) {
		const variables = [declared.envName, ...(declared.vendorEnvName ? [declared.vendorEnvName] : [])];
		const variable = variables.find((v) => values[v]);
		if (variable) held.push({ token: values[variable]!, variable, envName: declared.envName });
		else missing.push(declared.envName);
	}
	if (held.length === 0) {
		const names = input.tokens.flatMap((t) => [t.envName, ...(t.vendorEnvName ? [t.vendorEnvName] : [])]);
		throw new HoldsNoTokenError(`${environment} holds none of ${names.join(", ")}`);
	}
	// The declared tokens go to the plugin as its token; they are never also handed over as a plain value.
	for (const declared of input.tokens) {
		delete plain[declared.envName];
		if (declared.vendorEnvName) delete plain[declared.vendorEnvName];
	}
	return { environment, held, missing, plain };
}
