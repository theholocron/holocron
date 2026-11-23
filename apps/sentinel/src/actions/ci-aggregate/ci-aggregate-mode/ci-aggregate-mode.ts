import { createEnvLookup, withEnvPrefix } from "@theholocron/env-utils/lookup";

import type { CiAggregateEnv, CiAggregateMode } from "../ci-aggregate.type.js";

/**
 * How the `ci` aggregate runs on this deployment: `SENTINEL_CI_AGGREGATE=shadow` turns the shadow on, anything else
 * (unset, empty, a misspelling) leaves it off, so a deployment that never sets it is unchanged and a typo fails quiet.
 */
export function ciAggregateMode(env: CiAggregateEnv): CiAggregateMode {
	const value = withEnvPrefix(createEnvLookup(env as Record<string, string | undefined>), "SENTINEL").get(
		"CI_AGGREGATE"
	);
	return value === "shadow" ? "shadow" : "off";
}
