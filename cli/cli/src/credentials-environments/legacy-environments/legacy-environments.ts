/**
 * MIGRATION ONLY (#2063): the Environments the config named before the rename to `<org/repo> - <layer>`. Delete this
 * folder, its import in `resolve-environments/` and the one call there once the rename in 1Password is done. It is not
 * a layer: it is tried only when a required new name is missing.
 */

import type { EnvironmentCandidate } from "../environment-layers/index.js";

const OLD_NAMES = ["Holocron", "Holocron - GitHub Actions variables"];

/** The old Environment names, as candidates that are never reported when absent. */
export function legacyEnvironments(): EnvironmentCandidate[] {
	return OLD_NAMES.map((name) => ({ name, optional: true, legacy: true }));
}
