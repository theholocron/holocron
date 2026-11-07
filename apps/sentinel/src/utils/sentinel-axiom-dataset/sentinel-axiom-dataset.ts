import { withEnvPrefix } from "@theholocron/env-utils/lookup";

import type { EnvSource } from "../axiom-config/index.js";

/**
 * Sentinel's Axiom dataset: `SENTINEL_AXIOM_DATASET`, else the bare `AXIOM_DATASET` an environment synced before the
 * rename still holds. One definition for the logger (`resolveAxiomConfig()`) and the check-run link
 * (`sentinelAxiomLogUrl()`), so a deploy that runs ahead of the `Sentinel` Environment's update keeps shipping logs.
 *
 * @param env - The environment to read; tests pass a fake.
 * @returns The dataset name, or `undefined` when neither variable is set.
 */
export function sentinelAxiomDataset(env: EnvSource): string | undefined {
	return withEnvPrefix(env, "SENTINEL").get("AXIOM_DATASET");
}
