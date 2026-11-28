import { lastWins, mergeByKey, type MergeStrategies, shallowMerge, union } from "@theholocron/kyber/config";

import type { RawProvidersConfig } from "../../config/index.js";
import type { ComposedPreset } from "../compose.type.js";
import { mergeRepo } from "../merge-repo/index.js";
import { taskName } from "../task-name/index.js";

/**
 * How `compose()` merges each key of the capabilities: tasks by name (an old dotted alias overrides the entry it names),
 * providers shallowly, the non-task required checks as a union, `repo` by its own rules, the rest last writer wins.
 */
export const mergeStrategies: MergeStrategies<ComposedPreset> = {
	tasks: mergeByKey(taskName),
	providers: shallowMerge<RawProvidersConfig>(),
	extraRequiredChecks: union<string>(),
	repo: { empty: {}, merge: mergeRepo },
	org: lastWins(),
	domain: lastWins(),
	docs: lastWins(),
};
