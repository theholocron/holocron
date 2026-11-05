import { createConfigSystem } from "@theholocron/kyber/config";

import type { Capability, ComposedPreset } from "../compose/compose.type.js";
import { mergeStrategies } from "../compose/merge-strategies/index.js";
import { type HolocronConfig, resolveConfig, type ResolvedHolocronConfig } from "../config/index.js";
import { deriveDefaults } from "../load-config/derive-defaults/index.js";

/** Holocron's config system, built from kyber's factory; `loadConfig`, `compose` and `defineConfig` wrap its parts. */
export const system = createConfigSystem<HolocronConfig, ResolvedHolocronConfig, Capability, ComposedPreset>({
	name: "holocron",
	derive: deriveDefaults,
	resolve: resolveConfig,
	merge: mergeStrategies,
});
