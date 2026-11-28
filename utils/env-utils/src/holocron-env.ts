import { createEnvLookup, type EnvLookup } from "./create-env-lookup.js";
import { withEnvPrefix } from "./with-env-prefix.js";

/**
 * The one definition of the prefix every Holocron-owned environment variable carries: `HOLOCRON_<NAME>` is read before
 * the bare `<NAME>`. Hand it to {@link withEnvPrefix}, to `resolveValue`'s `prefix` option (`@theholocron/kyber/secrets`)
 * or to a CLI's `envPrefix`; never write the string again.
 */
export const PREFIX = "HOLOCRON";

/**
 * An {@link EnvLookup} for a variable Holocron owns: `get("AXIOM_DATASET")` tries `HOLOCRON_AXIOM_DATASET` and then
 * the bare `AXIOM_DATASET`, which is kept as a fallback. `source` is the environment to read (the process environment
 * when omitted, as in {@link createEnvLookup}).
 *
 * Do not use it for a name a third party reads itself (`GITHUB_TOKEN`, `CI`, `NO_UPDATE_NOTIFIER`): there the bare
 * name is the contract and the prefixed one would be an extra spelling nothing else knows.
 *
 * @example
 * const dataset = holocronEnv().get("AXIOM_DATASET"); // HOLOCRON_AXIOM_DATASET, else AXIOM_DATASET
 */
export function holocronEnv(source?: Record<string, string | undefined>): EnvLookup {
	return withEnvPrefix(createEnvLookup(source), PREFIX);
}
