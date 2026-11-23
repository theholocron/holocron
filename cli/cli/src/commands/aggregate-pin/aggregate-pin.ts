import { AGGREGATE_CHECK } from "@theholocron/astromech";
import type { CiConfig } from "@theholocron/astromech/config";

import type { AggregatePinPlan } from "./aggregate-pin.type.js";

/**
 * Reads `ci.pin` against the repo's derived required checks. Off (no pin, `problem` unset) when the option is not set;
 * only the `ci / Required checks` context is ever pinned, never the other required checks. When the option is set but
 * that context is not required (a repo on the legacy gate, or a preset that requires nothing), nothing is pinned and
 * `problem` says why, so neither `setup` nor `doctor repo` pretends the pin is in place.
 */
export function aggregatePin(ci: CiConfig | undefined, requiredChecks: readonly string[]): AggregatePinPlan {
	if (ci?.pin === undefined) return { pins: {} };
	if (!requiredChecks.includes(AGGREGATE_CHECK)) {
		return { pins: {}, problem: `ci.pin is set but ${AGGREGATE_CHECK} is not a required check of this repo` };
	}
	return { pins: { [AGGREGATE_CHECK]: ci.pin.integrationId } };
}
